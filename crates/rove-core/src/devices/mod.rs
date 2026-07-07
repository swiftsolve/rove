//! LAN device discovery.
//!
//! `scan()` is a pipeline:
//!   1. wake idle hosts with an active sweep while mDNS listens (concurrent)
//!   2. read the kernel neighbor table (the ground truth for who exists)
//!   3. enrich each host — vendor (OUI), hostname (reverse DNS/mDNS), kind
//!   4. add this machine, sort gateway → self → by address
mod banner;
mod classify;
mod hostname;
mod netbios;
mod probe;
mod ssdp;
mod subnet;
mod sweep;

use crate::mdns;
use crate::network_info::{default_gateway, default_interface};
use crate::oui::{is_randomized_mac, lookup_vendor};
use crate::platform::{neighbor_table, RawNeighbor};
use crate::types::{LanDevice, LanDeviceScan};
use std::time::Duration;

/// How long the sweep + mDNS window lasts. Both run concurrently, so this is
/// also (roughly) the total added latency of a scan.
const DISCOVERY_WINDOW: Duration = Duration::from_millis(3200);

pub async fn scan() -> LanDeviceScan {
    let (gateway, interface) = tokio::join!(default_gateway(), default_interface());

    let subnet = match &interface {
        Some(name) => subnet::subnet_of(name).await,
        None => None,
    };

    // Resolved up front so the SSDP search can bind to the active interface's
    // address (right adapter on multi-homed/Windows hosts) and so `self` is
    // known when devices are built below.
    let (self_ip, self_mac) = match &interface {
        Some(name) => crate::interfaces::address_of(name).await,
        None => (None, None),
    };
    let local_ipv4 = self_ip.as_deref().and_then(|s| s.parse::<std::net::Ipv4Addr>().ok());

    // The sweep and TCP probe both wake idle hosts into the neighbor table; the
    // probe additionally reaches ICMP-filtering hosts and reports open ports.
    // mDNS and SSDP listen concurrently for devices that announce themselves.
    let (mdns_hits, ssdp_hits, open_ports) = match &subnet {
        Some(subnet) => {
            let (mdns_hits, ssdp_hits, (), ports) = tokio::join!(
                mdns::discover(DISCOVERY_WINDOW),
                ssdp::discover(DISCOVERY_WINDOW, local_ipv4),
                sweep::sweep(subnet),
                probe::probe(subnet),
            );
            (mdns_hits, ssdp_hits, ports)
        }
        None => {
            let (mdns_hits, ssdp_hits) = tokio::join!(
                mdns::discover(DISCOVERY_WINDOW),
                ssdp::discover(DISCOVERY_WINDOW, local_ipv4),
            );
            (mdns_hits, ssdp_hits, std::collections::HashMap::new())
        }
    };

    let in_scope: Vec<RawNeighbor> = neighbor_table()
        .await
        .into_iter()
        .filter(|n| subnet.as_deref().map(|s| subnet::contains(s, &n.ip)).unwrap_or(true))
        .collect();

    // Results stay aligned index-for-index with `in_scope` for the `zip` below.
    // Reverse-DNS, HTTP-banner and NetBIOS enrichment are independent — run them
    // together so their combined latency is one round, not three.
    let ips: Vec<String> = in_scope.iter().map(|n| n.ip.clone()).collect();
    let (hostnames, banner_hits, netbios_hits) = tokio::join!(
        hostname::resolve_many(&ips),
        banner::grab(&open_ports),
        netbios::query_many(&ips),
    );

    let enrichment = Enrichment {
        mdns: &mdns_hits,
        ssdp: &ssdp_hits,
        banner: &banner_hits,
        netbios: &netbios_hits,
        open_ports: &open_ports,
    };
    let mut devices: Vec<LanDevice> = in_scope
        .into_iter()
        .zip(hostnames)
        .map(|(neighbor, hostname)| {
            build_device(neighbor, hostname, &enrichment, gateway.as_deref(), self_ip.as_deref())
        })
        .collect();

    add_self_if_missing(&mut devices, self_ip.as_deref(), self_mac.as_deref());

    devices.sort_by_key(|d| (!d.is_gateway, !d.is_self, subnet::ip_sort_key(&d.ip)));
    devices.dedup_by(|a, b| a.mac == b.mac);

    LanDeviceScan {
        devices,
        subnet,
        interface_name: interface,
        scanned_at: crate::net_util::now_ms(),
    }
}

/// The per-scan lookup tables `build_device` draws on, all keyed by device IP.
/// Bundled so a device is enriched from one value rather than a long argument
/// list that grows with every new discovery source.
struct Enrichment<'a> {
    mdns: &'a std::collections::HashMap<String, mdns::MdnsHit>,
    ssdp: &'a std::collections::HashMap<String, ssdp::SsdpHit>,
    banner: &'a std::collections::HashMap<String, banner::BannerHit>,
    netbios: &'a std::collections::HashMap<String, String>,
    open_ports: &'a std::collections::HashMap<String, Vec<u16>>,
}

fn build_device(
    neighbor: RawNeighbor,
    resolved_hostname: Option<String>,
    enrichment: &Enrichment,
    gateway: Option<&str>,
    self_ip: Option<&str>,
) -> LanDevice {
    let vendor = lookup_vendor(&neighbor.mac).map(String::from);
    let is_gateway = gateway == Some(neighbor.ip.as_str());
    let is_self = self_ip == Some(neighbor.ip.as_str());
    let mdns = enrichment.mdns.get(&neighbor.ip);
    let ssdp = enrichment.ssdp.get(&neighbor.ip);
    let banner = enrichment.banner.get(&neighbor.ip);
    let ports = enrichment.open_ports.get(&neighbor.ip).map(Vec::as_slice).unwrap_or(&[]);

    // Name preference, most human first: a friendly mDNS name, then SSDP's UPnP
    // friendlyName, then the NetBIOS computer name (real name for Windows/SMB
    // hosts), falling back to the reverse-DNS hostname.
    let hostname = mdns
        .and_then(|hit| hit.name.clone())
        .or_else(|| ssdp.and_then(|hit| hit.name.clone()))
        .or_else(|| enrichment.netbios.get(&neighbor.ip).cloned())
        .or(resolved_hostname);

    // A hardware model from mDNS TXT is the most precise; SSDP's modelName next.
    let model = mdns
        .and_then(|hit| hit.model.clone())
        .or_else(|| ssdp.and_then(|hit| hit.model.clone()));

    LanDevice {
        kind: classify::classify(&classify::Signals {
            vendor: vendor.as_deref(),
            hostname: hostname.as_deref(),
            mdns,
            ssdp,
            banner,
            open_ports: ports,
            is_gateway,
            is_self,
        }),
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        vendor,
        hostname,
        model,
        is_gateway,
        is_self,
        reachable: neighbor.reachable,
        ip: neighbor.ip,
        mac: neighbor.mac,
    }
}

/// The neighbor table never lists the local machine — add it for a complete count.
fn add_self_if_missing(devices: &mut Vec<LanDevice>, self_ip: Option<&str>, self_mac: Option<&str>) {
    let (Some(ip), Some(mac)) = (self_ip, self_mac) else {
        return;
    };
    if devices.iter().any(|d| d.mac == mac) {
        return;
    }
    devices.push(LanDevice {
        ip: ip.to_string(),
        mac: mac.to_string(),
        vendor: lookup_vendor(mac).map(String::from),
        hostname: hostname::local_machine_name(),
        model: None,
        kind: "computer".into(),
        is_randomized_mac: is_randomized_mac(mac),
        is_gateway: false,
        is_self: true,
        reachable: true,
    });
}
