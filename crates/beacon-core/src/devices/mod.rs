//! LAN device discovery.
//!
//! `scan()` is a pipeline:
//!   1. wake idle hosts with an active sweep while mDNS listens (concurrent)
//!   2. read the kernel neighbor table (the ground truth for who exists)
//!   3. enrich each host — vendor (OUI), hostname (reverse DNS/mDNS), kind
//!   4. add this machine, sort gateway → self → by address
mod classify;
mod hostname;
mod probe;
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

    // The sweep and TCP probe both wake idle hosts into the neighbor table; the
    // probe additionally reaches ICMP-filtering hosts and reports open ports.
    let (mdns_hits, open_ports) = match &subnet {
        Some(subnet) => {
            let (hits, (), ports) = tokio::join!(
                mdns::discover(DISCOVERY_WINDOW),
                sweep::sweep(subnet),
                probe::probe(subnet),
            );
            (hits, ports)
        }
        None => (mdns::discover(DISCOVERY_WINDOW).await, std::collections::HashMap::new()),
    };

    let (self_ip, self_mac) = match &interface {
        Some(name) => crate::interfaces::address_of(name).await,
        None => (None, None),
    };

    let in_scope: Vec<RawNeighbor> = neighbor_table()
        .await
        .into_iter()
        .filter(|n| subnet.as_deref().map(|s| subnet::contains(s, &n.ip)).unwrap_or(true))
        .collect();

    // Results stay aligned index-for-index with `in_scope` for the `zip` below.
    let ips: Vec<String> = in_scope.iter().map(|n| n.ip.clone()).collect();
    let hostnames: Vec<Option<String>> = hostname::resolve_many(&ips).await;

    let mut devices: Vec<LanDevice> = in_scope
        .into_iter()
        .zip(hostnames)
        .map(|(neighbor, hostname)| {
            build_device(
                neighbor,
                hostname,
                &mdns_hits,
                &open_ports,
                gateway.as_deref(),
                self_ip.as_deref(),
            )
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

fn build_device(
    neighbor: RawNeighbor,
    resolved_hostname: Option<String>,
    mdns_hits: &std::collections::HashMap<String, mdns::MdnsHit>,
    open_ports: &std::collections::HashMap<String, Vec<u16>>,
    gateway: Option<&str>,
    self_ip: Option<&str>,
) -> LanDevice {
    let vendor = lookup_vendor(&neighbor.mac).map(String::from);
    let is_gateway = gateway == Some(neighbor.ip.as_str());
    let is_self = self_ip == Some(neighbor.ip.as_str());
    let mdns = mdns_hits.get(&neighbor.ip);
    let ports = open_ports.get(&neighbor.ip).map(Vec::as_slice).unwrap_or(&[]);

    // A friendly mDNS name ("Living room clock") beats a reverse-DNS hostname.
    let hostname = mdns.and_then(|hit| hit.name.clone()).or(resolved_hostname);

    LanDevice {
        kind: classify::classify(vendor.as_deref(), hostname.as_deref(), mdns, ports, is_gateway, is_self),
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        vendor,
        hostname,
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
        kind: "computer".into(),
        is_randomized_mac: is_randomized_mac(mac),
        is_gateway: false,
        is_self: true,
        reachable: true,
    });
}
