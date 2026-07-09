//! LAN device discovery.
//!
//! `scan()` is a pipeline:
//!   1. wake idle hosts with an active sweep while mDNS listens (concurrent)
//!   2. read the kernel neighbor table (the ground truth for who exists)
//!   3. enrich each host — vendor (OUI), hostname (reverse DNS/mDNS), kind
//!   4. add this machine, sort gateway → self → by address
mod banner;
mod classify;
mod history;
/// Public so diagnostics/examples (and the planned alerts feature) can drive the
/// passive listener and read captures directly.
pub mod dhcp;
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

    // Passive DHCP fingerprints accumulated by the background listener since
    // startup (keyed by MAC — a joining client has no IP yet). Empty on the
    // first scan, and empty entirely if the listener lacks the privilege to
    // bind :67.
    let dhcp_hits = dhcp::snapshot();

    let enrichment = Enrichment {
        mdns: &mdns_hits,
        ssdp: &ssdp_hits,
        banner: &banner_hits,
        netbios: &netbios_hits,
        dhcp: &dhcp_hits,
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
        dhcp_status: dhcp::status(),
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
    dhcp: &'a std::collections::HashMap<String, dhcp::DhcpHit>,
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
    let dhcp = enrichment.dhcp.get(&dhcp::normalize_mac(&neighbor.mac));

    // mDNS/SSDP/banner/port signals are captured opportunistically in one lossy
    // discovery window, so a device that advertised a decisive signal on an
    // earlier scan may go quiet on this one — which used to flip its kind (a
    // cast + HomeKit TV flapping between "TV / Media" and "Smart home"). Fold
    // this scan's catch into the per-MAC accumulator and classify from the
    // union of everything ever seen, so a signal observed once isn't forgotten.
    // (DHCP already accumulates in its own background listener.) A device with
    // no MAC can't be keyed, so it classifies from this scan alone.
    let fresh = history::DeviceEvidence {
        mdns: enrichment.mdns.get(&neighbor.ip).cloned().unwrap_or_default(),
        ssdp: enrichment.ssdp.get(&neighbor.ip).cloned().unwrap_or_default(),
        banner: enrichment.banner.get(&neighbor.ip).cloned().unwrap_or_default(),
        ports: enrichment.open_ports.get(&neighbor.ip).cloned().unwrap_or_default(),
    };
    let evidence = if neighbor.mac.is_empty() {
        fresh
    } else {
        history::merge_and_snapshot(&neighbor.mac, fresh)
    };

    // An Amazon-OUI host advertising Spotify Connect is an Echo: Fire TVs and
    // other Amazon gear don't announce a `_spotify-connect._tcp` receiver, so the
    // pairing is a reliable fingerprint. It lets us name and type the device even
    // though its only self-reported mDNS label is the generic "SpotifyConnect"
    // service brand (dropped upstream in `mdns`).
    let is_amazon = vendor.as_deref().is_some_and(|v| v.to_ascii_lowercase().contains("amazon"));
    let is_echo = is_amazon && evidence.mdns.spotify_connect && !is_gateway && !is_self;

    // Name preference, most human first: a friendly mDNS name, then SSDP's UPnP
    // friendlyName, then the NetBIOS computer name (real name for Windows/SMB
    // hosts), then the DHCP-reported hostname (covers non-Windows hosts NetBIOS
    // misses), the reverse-DNS hostname, and finally a synthesized "Amazon Echo"
    // when nothing named the device but the Echo fingerprint matched.
    let hostname = evidence
        .mdns
        .name
        .clone()
        .or_else(|| evidence.ssdp.name.clone())
        .or_else(|| enrichment.netbios.get(&neighbor.ip).cloned())
        .or_else(|| dhcp.and_then(|hit| hit.hostname.clone()))
        .or(resolved_hostname)
        .or_else(|| is_echo.then(|| "Amazon Echo".to_string()));

    // Reverse-DNS / NetBIOS names (the only label a Kasa-style plug exposes) flap
    // across scans, and a nameless scan would drop the hostname classify vote and
    // revert the device to its bare vendor kind ("HS103" plug → iot falling back
    // to TP-Link → router). Remember the resolved name per-MAC so it — and the
    // kind derived from it below — stays put. A MAC-less host can't be keyed.
    let hostname = if neighbor.mac.is_empty() {
        hostname
    } else {
        history::stable_name(&neighbor.mac, hostname)
    };

    // A hardware model from mDNS TXT is the most precise; SSDP's modelName next.
    let model = evidence.mdns.model.clone().or_else(|| evidence.ssdp.model.clone());

    // An Echo is fundamentally a speaker; keep that label even when it also acts
    // as a Matter/Thread hub (a strong `iot` vote that would otherwise win).
    let kind = if is_echo {
        "speaker".to_string()
    } else {
        classify::classify(&classify::Signals {
            vendor: vendor.as_deref(),
            hostname: hostname.as_deref(),
            mdns: Some(&evidence.mdns),
            ssdp: Some(&evidence.ssdp),
            banner: Some(&evidence.banner),
            dhcp,
            open_ports: &evidence.ports,
            is_gateway,
            is_self,
        })
    };

    LanDevice {
        kind,
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        os: dhcp.and_then(|hit| hit.os).map(String::from),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Build a device from a bare neighbor plus an mDNS hit, with every other
    /// enrichment source empty — enough to exercise the Amazon-Echo path.
    fn device_with_mdns(mac: &str, ip: &str, mdns: mdns::MdnsHit) -> LanDevice {
        let mut mdns_map = HashMap::new();
        mdns_map.insert(ip.to_string(), mdns);
        let (ssdp, banner, netbios, dhcp, ports) =
            (HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new());
        let enrichment = Enrichment {
            mdns: &mdns_map,
            ssdp: &ssdp,
            banner: &banner,
            netbios: &netbios,
            dhcp: &dhcp,
            open_ports: &ports,
        };
        let neighbor = RawNeighbor { ip: ip.to_string(), mac: mac.to_string(), reachable: true };
        build_device(neighbor, None, &enrichment, None, None)
    }

    #[test]
    fn amazon_plus_spotify_connect_is_a_named_echo_speaker() {
        // 08:12:A5 is an Amazon OUI; the Spotify Connect flag completes the Echo
        // fingerprint, so it names and types the device even with no other signal.
        let hit = mdns::MdnsHit { spotify_connect: true, ..Default::default() };
        let echo = device_with_mdns("08:12:a5:00:00:11", "192.168.2.20", hit);
        assert_eq!(echo.kind, "speaker");
        assert_eq!(echo.hostname.as_deref(), Some("Amazon Echo"));
    }

    #[test]
    fn amazon_without_spotify_connect_is_not_forced_to_echo() {
        // A Fire TV (Amazon OUI, no Spotify Connect receiver) must keep classifying
        // normally rather than being mislabeled a speaker.
        let echo = device_with_mdns("08:12:a5:00:00:12", "192.168.2.21", mdns::MdnsHit::default());
        assert_ne!(echo.hostname.as_deref(), Some("Amazon Echo"));
        assert_ne!(echo.kind, "speaker");
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
        os: None,
        kind: "computer".into(),
        is_randomized_mac: is_randomized_mac(mac),
        is_gateway: false,
        is_self: true,
        reachable: true,
    });
}
