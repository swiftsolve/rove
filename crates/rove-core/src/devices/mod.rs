//! LAN device discovery. No OS API lists LAN devices, so `scan()` provokes
//! every host into the kernel neighbor table and reads that as ground truth:
//!   1. scope the active interface's subnet
//!   2. ping sweep and TCP probe every host while mDNS and SSDP listen
//!   3. read the neighbor table
//!   4. enrich each host: vendor (OUI), name (mDNS, SSDP, NetBIOS, DHCP,
//!      reverse DNS), model, kind, liveness
//!   5. add this machine, sort gateway, self, then by address, dedupe by MAC
//!
//! `docs/networking/device-discovery.md` walks through it.
mod banner;
mod classify;
/// Public for the `rove-dhcp-helper` binary and the examples.
pub mod dhcp;
mod history;
pub mod hostname;
mod kind;
mod liveness;
pub mod mdns;
mod netbios;
pub mod oui;
mod probe;
mod snmp;
mod ssdp;
mod subnet;
mod sweep;

pub use dhcp::DhcpStatus;
pub use kind::{DeviceKind, KindConfidence};

use crate::connection::{default_gateway, default_interface};
use crate::devices::oui::{is_kind_ambiguous_vendor, is_randomized_mac, lookup_vendor};
use crate::platform::{neighbor_table, RawNeighbor};
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDevice {
    pub ip: String,
    pub mac: String,
    pub vendor: Option<String>,
    pub hostname: Option<String>,
    /// Hardware model from mDNS TXT, a UPnP description or SNMP, with Apple
    /// identifiers humanized ("MacBook Pro", "BRAVIA KD-55X").
    pub model: Option<String>,
    /// OS family from the passive DHCP fingerprint ("Android", "Windows",
    /// "Apple").
    pub os: Option<String>,
    pub kind: DeviceKind,
    /// "high" when the classifier's verdict was decisive, "low" when it's a
    /// thin-margin best guess the UI hedges (e.g. "Phone?").
    pub kind_confidence: KindConfidence,
    pub is_randomized_mac: bool,
    pub is_gateway: bool,
    pub is_self: bool,
    pub is_reachable: bool,
    /// Epoch ms this device last answered, so the UI can show "last seen 3m ago"
    /// for an offline device. `None` until the store's roster merge stamps it.
    pub last_seen: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDeviceScan {
    pub devices: Vec<LanDevice>,
    pub subnet: Option<String>,
    pub interface_name: Option<String>,
    pub scanned_at: u64,
    /// Passive DHCP fingerprinting's state.
    pub dhcp_status: DhcpStatus,
}

/// The probe and listen window. Sweep, TCP probe, mDNS and SSDP run
/// concurrently, so this is roughly the scan's added latency.
const DISCOVERY_WINDOW: Duration = Duration::from_millis(3200);

/// The passive refresh's listen window. mDNS and SSDP are multicast, so it's
/// nearly free, and on the stateless macOS/Windows ARP table it's the refresh's
/// only liveness source, so it gets a full window.
const PASSIVE_WINDOW: Duration = Duration::from_millis(2500);

/// SSDP window for [`gateway_identity`]. Short: only the router's own reply
/// matters, and the panel waiting on it should stay snappy.
const GATEWAY_SSDP_WINDOW: Duration = Duration::from_millis(2000);

pub async fn scan() -> LanDeviceScan {
    let (gateway, interface) = tokio::join!(default_gateway(), default_interface());

    let subnet = match &interface {
        Some(name) => subnet::subnet_of(name).await,
        None => None,
    };

    // Up front so SSDP and SNMP can bind to the active interface's address
    // (the right adapter on multi-homed and Windows hosts).
    let (self_ip, self_mac) = match &interface {
        Some(name) => crate::connection::interfaces::address_of(name).await,
        None => (None, None),
    };
    let local_ipv4 = self_ip.as_deref().and_then(|s| s.parse::<std::net::Ipv4Addr>().ok());

    // The sweep and probe wake idle hosts into the neighbor table; the probe
    // also reaches hosts that drop ICMP. mDNS and SSDP catch self-announcers.
    let (mdns_hits, ssdp_hits, ping_live, open_ports, tcp_live) = match &subnet {
        Some(subnet) => {
            let (mdns_hits, ssdp_hits, ping_live, probed) = tokio::join!(
                mdns::discover(DISCOVERY_WINDOW),
                ssdp::discover(DISCOVERY_WINDOW, local_ipv4),
                sweep::sweep(subnet),
                probe::probe(subnet),
            );
            (mdns_hits, ssdp_hits, ping_live, probed.open_ports, probed.responsive)
        }
        None => {
            let (mdns_hits, ssdp_hits) =
                tokio::join!(mdns::discover(DISCOVERY_WINDOW), ssdp::discover(DISCOVERY_WINDOW, local_ipv4),);
            (
                mdns_hits,
                ssdp_hits,
                std::collections::HashSet::new(),
                std::collections::HashMap::new(),
                std::collections::HashSet::new(),
            )
        }
    };

    let in_scope: Vec<RawNeighbor> = neighbor_table()
        .await
        .into_iter()
        .filter(|n| subnet.as_deref().map(|s| subnet::contains(s, &n.ip)).unwrap_or(true))
        .collect();

    // Independent lookups run together so they cost one round, not four.
    // `hostnames` stays index-aligned with `in_scope` for the `zip` below. SNMP
    // asks only the gateway (see `snmp`).
    let ips: Vec<String> = in_scope.iter().map(|n| n.ip.clone()).collect();
    let (hostnames, banner_hits, netbios_hits, snmp_hits) = tokio::join!(
        hostname::resolve_many(&ips),
        banner::grab(&open_ports),
        netbios::query_many(&ips),
        snmp::discover(gateway.as_deref(), local_ipv4),
    );

    // Keyed by MAC, as a joining client has no IP yet. Empty on the first scan,
    // and always empty without the privilege to bind :67 (unless the helper
    // runs).
    let dhcp_hits = dhcp::snapshot();

    let enrichment = Enrichment {
        mdns: &mdns_hits,
        ssdp: &ssdp_hits,
        banner: &banner_hits,
        snmp: &snmp_hits,
        netbios: &netbios_hits,
        dhcp: &dhcp_hits,
        open_ports: &open_ports,
        ping_live: &ping_live,
        tcp_live: &tcp_live,
        was_probed: subnet.is_some(),
    };
    let mut devices: Vec<LanDevice> = in_scope
        .into_iter()
        .zip(hostnames)
        .map(|(neighbor, hostname)| {
            build_device(neighbor, hostname, &enrichment, gateway.as_deref(), self_ip.as_deref())
        })
        .collect();

    assemble(&mut devices, self_ip.as_deref(), self_mac.as_deref());

    LanDeviceScan {
        devices,
        subnet,
        interface_name: interface,
        scanned_at: crate::util::net::now_ms(),
        dhcp_status: dhcp::status(),
    }
}

/// A no-probe presence refresh for the background monitor: the neighbor table
/// plus mDNS and SSDP, with no sweep or TCP probe, so next to no per-host
/// traffic or battery cost. It returns only devices it can confirm are present
/// now and never asserts a departure, since passively a silent host looks just
/// like a departed one. [`crate::store::Store::touch_devices`] bumps
/// `last_seen` for these and leaves the rest of the roster alone.
pub async fn passive_refresh() -> Vec<LanDevice> {
    let (gateway, interface) = tokio::join!(default_gateway(), default_interface());

    let subnet = match &interface {
        Some(name) => subnet::subnet_of(name).await,
        None => None,
    };

    let (self_ip, self_mac) = match &interface {
        Some(name) => crate::connection::interfaces::address_of(name).await,
        None => (None, None),
    };
    let local_ipv4 = self_ip.as_deref().and_then(|s| s.parse::<std::net::Ipv4Addr>().ok());

    // A handful of multicast datagrams, no per-host probing: the whole
    // difference from `scan`.
    let (mdns_hits, ssdp_hits) =
        tokio::join!(mdns::discover(PASSIVE_WINDOW), ssdp::discover(PASSIVE_WINDOW, local_ipv4));

    let in_scope = neighbor_table()
        .await
        .into_iter()
        .filter(|n| subnet.as_deref().map(|s| subnet::contains(s, &n.ip)).unwrap_or(true));

    // Starts the DHCP listener even if the user never opens the Devices tab.
    let dhcp_hits = dhcp::snapshot();

    let mut devices: Vec<LanDevice> = in_scope
        .filter_map(|neighbor| {
            build_passive_device(neighbor, &mdns_hits, &ssdp_hits, &dhcp_hits, gateway.as_deref(), self_ip.as_deref())
        })
        .collect();

    assemble(&mut devices, self_ip.as_deref(), self_mac.as_deref());
    devices
}

/// A device for the passive refresh, or `None` when it can't be confirmed
/// present now. A Linux `ip neigh` REACHABLE state (`stateful` and `reachable`)
/// stands on its own; on the stateless macOS/Windows ARP table a host needs an
/// mDNS or SSDP announcement this window. Self and the gateway always count.
///
/// Classifies from the passive evidence it has (OUI, mDNS, SSDP, DHCP). Typing a
/// new arrival, rather than leaving it `unknown`, keeps a new router or AP at
/// its higher-severity `ap_appeared` warning instead of a plain join. It leaves
/// the cross-scan accumulators (`history`, `liveness`) to the active scan, and
/// `touch_devices` ignores this typing for devices the store already knows.
fn build_passive_device(
    neighbor: RawNeighbor,
    mdns: &std::collections::HashMap<String, mdns::MdnsHit>,
    ssdp: &std::collections::HashMap<String, ssdp::SsdpHit>,
    dhcp: &std::collections::HashMap<String, dhcp::DhcpHit>,
    gateway: Option<&str>,
    self_ip: Option<&str>,
) -> Option<LanDevice> {
    let is_gateway = gateway == Some(neighbor.ip.as_str());
    let is_self = self_ip == Some(neighbor.ip.as_str());
    let mdns_hit = mdns.get(&neighbor.ip);
    let ssdp_hit = ssdp.get(&neighbor.ip);
    let is_present = is_self
        || is_gateway
        || (neighbor.is_stateful && neighbor.is_reachable)
        || mdns_hit.is_some()
        || ssdp_hit.is_some();
    if !is_present {
        return None;
    }

    let vendor = lookup_vendor(&neighbor.mac);
    let dhcp_hit = dhcp.get(&crate::util::net::normalize_mac_bare(&neighbor.mac));

    // The full scan's name order, minus the active-only NetBIOS and reverse DNS.
    let hostname = mdns_hit
        .and_then(|h| h.name.clone())
        .or_else(|| ssdp_hit.and_then(|h| h.name.clone()))
        .or_else(|| dhcp_hit.and_then(|h| h.hostname.clone()));

    // Withhold a kind-ambiguous OUI's vote, as the full scan does.
    let classify_vendor = if is_kind_ambiguous_vendor(&neighbor.mac) { None } else { vendor.as_deref() };
    let verdict = classify::classify(&classify::Signals {
        vendor: classify_vendor,
        hostname: hostname.as_deref(),
        mdns: mdns_hit,
        ssdp: ssdp_hit,
        dhcp: dhcp_hit,
        is_gateway,
        is_self,
        ..Default::default()
    });

    Some(LanDevice {
        kind: verdict.kind,
        kind_confidence: verdict.confidence,
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        os: dhcp_hit.and_then(|hit| hit.os).map(String::from),
        vendor,
        hostname,
        model: None,
        is_gateway,
        is_self,
        is_reachable: true,
        ip: neighbor.ip,
        mac: neighbor.mac,
        last_seen: None,
    })
}

/// The default gateway's identity for the diagnostics Router panel, which
/// doesn't run a full scan. Every field is best effort.
pub struct GatewayIdentity {
    pub mac: Option<String>,
    /// Make from the MAC OUI.
    pub vendor: Option<String>,
    /// Model from SNMP `sysDescr`, else the UPnP `modelName`.
    pub model: Option<String>,
    /// The UPnP `friendlyName` (e.g. "Giga Hub 2.0 Internet Gateway Device").
    pub name: Option<String>,
}

/// The gateway's make, model and product name without a full scan. Ping the
/// gateway first so its neighbor-table entry is fresh. `local_ip`, when known,
/// is the active interface address SNMP and SSDP bind to.
pub async fn gateway_identity(gateway: Option<&str>, local_ip: Option<std::net::Ipv4Addr>) -> GatewayIdentity {
    let Some(gw) = gateway else {
        return GatewayIdentity { mac: None, vendor: None, model: None, name: None };
    };
    let mac = neighbor_table().await.into_iter().find(|n| n.ip == gw).map(|n| n.mac).filter(|m| !m.is_empty());
    let vendor = mac.as_deref().and_then(lookup_vendor);

    // SNMP names the model on gear that speaks it; most consumer routers
    // announce a UPnP friendlyName and modelName over SSDP instead.
    let (snmp_hits, ssdp_hits) =
        tokio::join!(snmp::discover(gateway, local_ip), ssdp::discover(GATEWAY_SSDP_WINDOW, local_ip));
    let ssdp_hit = ssdp_hits.get(gw);
    let name = ssdp_hit.and_then(|hit| hit.name.clone());
    let model = snmp_hits.get(gw).and_then(|hit| hit.model()).or_else(|| ssdp_hit.and_then(|hit| hit.model.clone()));
    GatewayIdentity { mac, vendor, model, name }
}

/// The per-scan lookup tables `build_device` draws on, keyed by IP except
/// `dhcp`, which is keyed by bare MAC. Bundled so a new discovery source doesn't
/// grow the argument list.
struct Enrichment<'a> {
    mdns: &'a std::collections::HashMap<String, mdns::MdnsHit>,
    ssdp: &'a std::collections::HashMap<String, ssdp::SsdpHit>,
    banner: &'a std::collections::HashMap<String, banner::BannerHit>,
    snmp: &'a std::collections::HashMap<String, snmp::SnmpHit>,
    netbios: &'a std::collections::HashMap<String, String>,
    dhcp: &'a std::collections::HashMap<String, dhcp::DhcpHit>,
    open_ports: &'a std::collections::HashMap<String, Vec<u16>>,
    /// IPs that replied to this scan's ICMP sweep.
    ping_live: &'a std::collections::HashSet<String>,
    /// IPs that accepted or refused this scan's TCP probe, which proves life even
    /// for a power-saving phone that drops ICMP and announces nothing.
    tcp_live: &'a std::collections::HashSet<String>,
    /// False when the subnet is unknown and no sweep or probe ran, so liveness
    /// falls back to the neighbor table's own state.
    was_probed: bool,
}

fn build_device(
    neighbor: RawNeighbor,
    resolved_hostname: Option<String>,
    enrichment: &Enrichment,
    gateway: Option<&str>,
    self_ip: Option<&str>,
) -> LanDevice {
    let vendor = lookup_vendor(&neighbor.mac);
    let is_gateway = gateway == Some(neighbor.ip.as_str());
    let is_self = self_ip == Some(neighbor.ip.as_str());
    let dhcp = enrichment.dhcp.get(&crate::util::net::normalize_mac_bare(&neighbor.mac));

    // One lossy window can miss a signal an earlier scan caught, which flipped
    // the kind, so classify from the per-MAC union of everything seen (see
    // `history`). DHCP accumulates in its own listener. A MAC-less device can't
    // be keyed, so it uses this scan alone.
    let fresh = scan_evidence(enrichment, &neighbor.ip);
    let evidence = if neighbor.mac.is_empty() { fresh } else { history::merge_and_snapshot(&neighbor.mac, fresh) };

    // An Amazon OUI advertising Spotify Connect is an Echo: Fire TVs and other
    // Amazon gear don't announce `_spotify-connect._tcp`. It names and types the
    // device even though its only mDNS label is the generic "SpotifyConnect",
    // dropped in `mdns`.
    let is_amazon = vendor.as_deref().is_some_and(|v| v.to_ascii_lowercase().contains("amazon"));
    let is_echo = is_amazon && evidence.mdns.spotify_connect && !is_gateway && !is_self;

    let hostname = pick_hostname(&neighbor, &evidence, enrichment, dhcp, resolved_hostname, is_echo);

    // mDNS TXT is the most precise; SNMP is the only source for routers that
    // announce on neither mDNS nor SSDP.
    let model = evidence.mdns.model.clone().or_else(|| evidence.ssdp.model.clone()).or_else(|| evidence.snmp.model());

    // An Echo is a speaker even when it also acts as a Matter or Thread hub,
    // whose strong `iot` vote would otherwise win.
    let verdict = if is_echo {
        classify::Verdict { kind: DeviceKind::Speaker, confidence: KindConfidence::High }
    } else {
        // A kind-ambiguous OUI (see `is_kind_ambiguous_vendor`) is shown but
        // doesn't vote.
        let classify_vendor = if is_kind_ambiguous_vendor(&neighbor.mac) { None } else { vendor.as_deref() };
        classify::classify(&classify::Signals {
            vendor: classify_vendor,
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

    // A randomized MAC has no OUI vendor, but an Apple handheld still gives its
    // maker away by model or default hostname. Display only; the classifier
    // above sticks to the OUI.
    let vendor = vendor.or_else(|| infer_vendor(hostname.as_deref(), model.as_deref()));

    // After vendor inference, which needs the raw "<family><gen>,<rev>" shape.
    let model = model.map(|m| humanize_model(&m));

    let is_reachable = is_self || is_gateway || is_reachable(&neighbor, enrichment);

    LanDevice {
        kind: verdict.kind,
        kind_confidence: verdict.confidence,
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        os: dhcp.and_then(|hit| hit.os).map(String::from),
        vendor,
        hostname,
        model,
        is_gateway,
        is_self,
        is_reachable,
        ip: neighbor.ip,
        mac: neighbor.mac,
        // Stamped by the store's roster merge (see `devices_with_offline`).
        last_seen: None,
    }
}

/// What this scan's enrichment passes heard from `ip`.
fn scan_evidence(enrichment: &Enrichment, ip: &str) -> history::DeviceEvidence {
    history::DeviceEvidence {
        mdns: enrichment.mdns.get(ip).cloned().unwrap_or_default(),
        ssdp: enrichment.ssdp.get(ip).cloned().unwrap_or_default(),
        banner: enrichment.banner.get(ip).cloned().unwrap_or_default(),
        snmp: enrichment.snmp.get(ip).cloned().unwrap_or_default(),
        ports: enrichment.open_ports.get(ip).cloned().unwrap_or_default(),
    }
}

/// The device's name, most human source first: mDNS, SSDP, NetBIOS, DHCP,
/// reverse DNS, then "Amazon Echo" for an Echo with none of those.
///
/// Each source carries its rank so the per-MAC name cache keeps this order
/// across scans: a flap-prone reverse-DNS PTR resolved later mustn't overwrite
/// a stronger name remembered from earlier. Remembering it also keeps the kind
/// stable, since a nameless scan would drop the hostname vote (an
/// "Office-LaserJet" falling back to its HP OUI, so computer).
fn pick_hostname(
    neighbor: &RawNeighbor,
    evidence: &history::DeviceEvidence,
    enrichment: &Enrichment,
    dhcp: Option<&dhcp::DhcpHit>,
    resolved_hostname: Option<String>,
    is_echo: bool,
) -> Option<String> {
    use history::NameRank;
    let ranked = evidence
        .mdns
        .name
        .clone()
        .map(|n| (n, NameRank::Mdns))
        .or_else(|| evidence.ssdp.name.clone().map(|n| (n, NameRank::Ssdp)))
        .or_else(|| enrichment.netbios.get(&neighbor.ip).cloned().map(|n| (n, NameRank::NetBios)))
        .or_else(|| dhcp.and_then(|hit| hit.hostname.clone()).map(|n| (n, NameRank::Dhcp)))
        .or_else(|| resolved_hostname.map(|n| (n, NameRank::ReverseDns)))
        .or_else(|| is_echo.then(|| ("Amazon Echo".to_string(), NameRank::Synthetic)));

    if neighbor.mac.is_empty() {
        ranked.map(|(name, _)| name)
    } else {
        history::stable_name(&neighbor.mac, ranked)
    }
}

/// Whether the device answered this scan. The macOS/Windows neighbor table has
/// no state, so a departed device would read Online for ~20 min. Any answer
/// (ICMP, TCP accept or RST, an announcement) or a Linux REACHABLE counts as
/// live, debounced per MAC (see `liveness`) so one dropped probe doesn't flip
/// it to Offline. With no probe run, the neighbor table's own state stands.
fn is_reachable(neighbor: &RawNeighbor, enrichment: &Enrichment) -> bool {
    if !enrichment.was_probed {
        return neighbor.is_reachable;
    }
    let ip = neighbor.ip.as_str();
    let is_live_now = (neighbor.is_stateful && neighbor.is_reachable)
        || enrichment.ping_live.contains(ip)
        || enrichment.tcp_live.contains(ip)
        || enrichment.mdns.contains_key(ip)
        || enrichment.ssdp.contains_key(ip)
        || enrichment.netbios.contains_key(ip)
        || enrichment.snmp.contains_key(ip)
        || enrichment.banner.contains_key(ip);
    if neighbor.mac.is_empty() {
        is_live_now // no stable key to debounce against
    } else {
        liveness::record_and_check(&neighbor.mac, is_live_now)
    }
}

/// The maker when the OUI came up empty. Apple only: its handhelds randomize
/// their MAC yet still self-label by model ("iPhone15,2") or default hostname
/// ("Jane's-iPad"). Other brands rarely do both, so they stay `None` rather
/// than risk a wrong guess.
fn infer_vendor(hostname: Option<&str>, model: Option<&str>) -> Option<String> {
    if model.is_some_and(is_apple_model) || hostname.is_some_and(is_apple_hostname) {
        return Some("Apple".to_string());
    }
    None
}

/// An Apple model identifier such as "iPhone15,2". The `<gen>,<rev>` suffix is
/// what tells it from a bare "iPad" hostname.
fn is_apple_model(model: &str) -> bool {
    const FAMILIES: [&str; 9] =
        ["iphone", "ipad", "ipod", "watch", "macbook", "imac", "macmini", "macpro", "audioaccessory"];
    let lower = model.trim().to_ascii_lowercase();
    lower.contains(',')
        && lower.bytes().any(|b| b.is_ascii_digit())
        && FAMILIES.iter().any(|family| lower.starts_with(family))
}

/// Apple identifiers ("MacBookPro18,1", "AudioAccessory5,1") as product names
/// ("MacBook Pro", "HomePod"). Anything else is already readable and passes
/// through.
fn humanize_model(model: &str) -> String {
    if !is_apple_model(model) {
        return model.to_string();
    }
    let family: String = model.trim().chars().take_while(|c| !c.is_ascii_digit()).collect();
    match family.to_ascii_lowercase().as_str() {
        "audioaccessory" => "HomePod".to_string(),
        "watch" => "Apple Watch".to_string(),
        "macmini" => "Mac mini".to_string(),
        "macpro" => "Mac Pro".to_string(),
        "macbook" => "MacBook".to_string(),
        "macbookpro" => "MacBook Pro".to_string(),
        "macbookair" => "MacBook Air".to_string(),
        // "iPhone", "iPad", "iMac", "iPod": already the product name.
        _ => family,
    }
}

/// A hostname naming an Apple product, matched as a substring so personalized
/// forms ("Janes-iPad") count.
fn is_apple_hostname(hostname: &str) -> bool {
    const MARKERS: [&str; 10] =
        ["iphone", "ipad", "ipod", "macbook", "imac", "macmini", "mac-mini", "airpods", "apple-watch", "apple watch"];
    let lower = hostname.to_ascii_lowercase();
    MARKERS.iter().any(|marker| lower.contains(marker))
}

/// The finishing pass both scans share: add this machine, sort gateway first,
/// then self, then by address (`false` sorts before `true`), and drop a second
/// IP for the same MAC.
fn assemble(devices: &mut Vec<LanDevice>, self_ip: Option<&str>, self_mac: Option<&str>) {
    add_self_if_missing(devices, self_ip, self_mac);
    devices.sort_by_key(|d| (!d.is_gateway, !d.is_self, subnet::ip_sort_key(&d.ip)));
    devices.dedup_by(|a, b| a.mac == b.mac);
}

/// The neighbor table never lists the local machine.
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
        vendor: lookup_vendor(mac),
        hostname: hostname::local_machine_name(),
        model: None,
        os: None,
        kind: DeviceKind::Computer,
        kind_confidence: KindConfidence::High,
        is_randomized_mac: is_randomized_mac(mac),
        is_gateway: false,
        is_self: true,
        is_reachable: true,
        last_seen: None,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// A device from a bare neighbor and an mDNS hit, every other source empty.
    fn device_with_mdns(mac: &str, ip: &str, mdns: mdns::MdnsHit) -> LanDevice {
        let mut mdns_map = HashMap::new();
        mdns_map.insert(ip.to_string(), mdns);
        let (ssdp, banner, snmp, netbios, dhcp, ports) =
            (HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new(), HashMap::new());
        let ping_live = std::collections::HashSet::new();
        let tcp_live = std::collections::HashSet::new();
        let enrichment = Enrichment {
            mdns: &mdns_map,
            ssdp: &ssdp,
            banner: &banner,
            snmp: &snmp,
            netbios: &netbios,
            dhcp: &dhcp,
            open_ports: &ports,
            ping_live: &ping_live,
            tcp_live: &tcp_live,
            was_probed: true,
        };
        let neighbor = RawNeighbor { ip: ip.to_string(), mac: mac.to_string(), is_reachable: true, is_stateful: true };
        build_device(neighbor, None, &enrichment, None, None)
    }

    #[test]
    fn passive_confirms_a_linux_reachable_entry_but_not_a_stale_one() {
        let (mdns, ssdp, dhcp) = (HashMap::new(), HashMap::new(), HashMap::new());
        // Linux `ip neigh` REACHABLE (stateful + reachable) is real liveness, so
        // it's confirmed present with no announcement needed.
        let reachable = RawNeighbor {
            ip: "192.168.1.5".into(),
            mac: "aa:bb:cc:dd:ee:01".into(),
            is_reachable: true,
            is_stateful: true,
        };
        assert!(build_passive_device(reachable, &mdns, &ssdp, &dhcp, None, None).is_some());
        // A STALE entry that announces nothing is left to an active scan.
        let stale = RawNeighbor {
            ip: "192.168.1.6".into(),
            mac: "aa:bb:cc:dd:ee:02".into(),
            is_reachable: false,
            is_stateful: true,
        };
        assert!(build_passive_device(stale, &mdns, &ssdp, &dhcp, None, None).is_none());
    }

    #[test]
    fn passive_does_not_trust_a_stateless_arp_entry_without_an_announcement() {
        // macOS/Windows `arp -a` reports reachable=true, stateful=false: a
        // placeholder, not liveness. A departed device lingers ~20 min.
        let (mut mdns, ssdp, dhcp) = (HashMap::new(), HashMap::<String, ssdp::SsdpHit>::new(), HashMap::new());
        let bare = RawNeighbor {
            ip: "192.168.1.7".into(),
            mac: "aa:bb:cc:dd:ee:03".into(),
            is_reachable: true,
            is_stateful: false,
        };
        assert!(
            build_passive_device(bare, &mdns, &ssdp, &dhcp, None, None).is_none(),
            "a stale ARP-cache entry must not be confirmed present"
        );

        // The same kind of host announcing over mDNS is confirmed, with its name.
        mdns.insert("192.168.1.8".into(), mdns::MdnsHit { name: Some("Living Room TV".into()), ..Default::default() });
        let announcing = RawNeighbor {
            ip: "192.168.1.8".into(),
            mac: "aa:bb:cc:dd:ee:04".into(),
            is_reachable: true,
            is_stateful: false,
        };
        let dev = build_passive_device(announcing, &mdns, &ssdp, &dhcp, None, None).expect("announced host");
        assert!(dev.is_reachable);
        assert_eq!(dev.hostname.as_deref(), Some("Living Room TV"));
    }

    #[test]
    fn passive_always_confirms_self_and_gateway() {
        // Even a stale, silent gateway entry is confirmed.
        let (mdns, ssdp, dhcp) = (HashMap::new(), HashMap::new(), HashMap::new());
        let gw = RawNeighbor {
            ip: "192.168.1.1".into(),
            mac: "aa:bb:cc:dd:ee:05".into(),
            is_reachable: false,
            is_stateful: false,
        };
        let dev = build_passive_device(gw, &mdns, &ssdp, &dhcp, Some("192.168.1.1"), None)
            .expect("the gateway is always present");
        assert!(dev.is_gateway);
    }

    #[test]
    fn passive_types_a_new_router_so_it_keeps_its_ap_warning() {
        // A new non-gateway router is an `ap_appeared` warning only if typed a
        // router, so a rogue AP joining while backgrounded must keep its DHCP
        // router fingerprint.
        let (mdns, ssdp) = (HashMap::new(), HashMap::new());
        let mut dhcp: HashMap<String, dhcp::DhcpHit> = HashMap::new();
        dhcp.insert(
            crate::util::net::normalize_mac_bare("aa:bb:cc:dd:dd:06"),
            dhcp::DhcpHit { kind: Some(DeviceKind::Router), ..Default::default() },
        );
        let ap = RawNeighbor {
            ip: "192.168.1.9".into(),
            mac: "aa:bb:cc:dd:dd:06".into(),
            is_reachable: true,
            is_stateful: true,
        };
        let dev = build_passive_device(ap, &mdns, &ssdp, &dhcp, None, None).expect("present");
        assert_eq!(dev.kind, DeviceKind::Router, "a router fingerprint types the arrival as router");
        assert!(!dev.is_gateway, "and not the gateway → emit_new_device raises ap_appeared");
    }

    #[test]
    fn a_tcp_answer_alone_reads_a_stateless_device_as_reachable() {
        // A randomized-MAC phone in power-save drops ICMP and announces nothing,
        // but RSTs a SYN to a closed port. On a stateless (macOS `arp -a`)
        // entry that TCP answer is the only live signal, and must be enough.
        let (mdns, ssdp, banner, snmp, netbios, dhcp, ports) = (
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
        );
        let ping_live = std::collections::HashSet::new();
        let mut tcp_live = std::collections::HashSet::new();
        tcp_live.insert("192.168.2.35".to_string());
        let enrichment = Enrichment {
            mdns: &mdns,
            ssdp: &ssdp,
            banner: &banner,
            snmp: &snmp,
            netbios: &netbios,
            dhcp: &dhcp,
            open_ports: &ports,
            ping_live: &ping_live,
            tcp_live: &tcp_live,
            was_probed: true,
        };
        let neighbor = RawNeighbor {
            ip: "192.168.2.35".to_string(),
            mac: "a6:80:ee:e0:f8:f7".to_string(),
            is_reachable: true,
            is_stateful: false,
        };
        let device = build_device(neighbor, None, &enrichment, None, None);
        assert!(device.is_reachable, "a TCP RST/accept is a live signal on its own");
    }

    #[test]
    fn amazon_plus_spotify_connect_is_a_named_echo_speaker() {
        // 08:12:A5 is an Amazon OUI; with Spotify Connect that's an Echo.
        let hit = mdns::MdnsHit { spotify_connect: true, ..Default::default() };
        let echo = device_with_mdns("08:12:a5:00:00:11", "192.168.2.20", hit);
        assert_eq!(echo.kind, DeviceKind::Speaker);
        assert_eq!(echo.hostname.as_deref(), Some("Amazon Echo"));
    }

    #[test]
    fn amazon_without_spotify_connect_is_not_forced_to_echo() {
        // A Fire TV: Amazon OUI, no Spotify Connect.
        let echo = device_with_mdns("08:12:a5:00:00:12", "192.168.2.21", mdns::MdnsHit::default());
        assert_ne!(echo.hostname.as_deref(), Some("Amazon Echo"));
        assert_ne!(echo.kind, DeviceKind::Speaker);
    }

    #[test]
    fn a_motorola_wuhan_odm_oui_is_not_confidently_typed_a_phone() {
        // A Lenovo speaker on the 08:38:E6 Motorola (Wuhan) ODM block shows
        // "Motorola" but, with no other signal, must not be typed a phone.
        let device = device_with_mdns("08:38:e6:d8:df:23", "192.168.2.19", mdns::MdnsHit::default());
        assert_eq!(device.vendor.as_deref(), Some("Motorola"));
        assert_ne!(device.kind, DeviceKind::Phone);
        assert_eq!(device.kind, DeviceKind::Unknown);

        // The 00:62:01 Motorola Mobility phone block tidies the same but stays a
        // phone.
        let phone = device_with_mdns("00:62:01:00:00:22", "192.168.2.29", mdns::MdnsHit::default());
        assert_eq!(phone.vendor.as_deref(), Some("Motorola"));
        assert_eq!(phone.kind, DeviceKind::Phone);
    }

    #[test]
    fn apple_model_and_hostname_infer_an_apple_vendor() {
        assert_eq!(infer_vendor(None, Some("iPhone15,2")).as_deref(), Some("Apple"));
        assert_eq!(infer_vendor(Some("iPhone"), None).as_deref(), Some("Apple"));
        assert_eq!(infer_vendor(Some("Janes-iPad"), None).as_deref(), Some("Apple"));
        assert_eq!(infer_vendor(Some("Apple-Watch"), None).as_deref(), Some("Apple"));
    }

    #[test]
    fn non_apple_signals_infer_no_vendor() {
        assert!(infer_vendor(Some("Galaxy-S21"), None).is_none());
        assert!(infer_vendor(Some("living-room"), Some("BRAVIA KD-55X")).is_none());
        assert!(infer_vendor(None, None).is_none());
    }

    #[test]
    fn a_bare_ipad_model_string_is_not_mistaken_for_a_model_id() {
        // "iPad" alone is a hostname; hostname matching covers it.
        assert!(!is_apple_model("iPad"));
        assert!(is_apple_model("iPad13,4"));
    }

    #[test]
    fn humanize_model_reads_apple_identifiers_as_product_names() {
        assert_eq!(humanize_model("MacBookPro18,1"), "MacBook Pro");
        assert_eq!(humanize_model("MacBookAir10,1"), "MacBook Air");
        assert_eq!(humanize_model("iMac21,1"), "iMac");
        assert_eq!(humanize_model("iPhone15,2"), "iPhone");
        assert_eq!(humanize_model("iPad13,4"), "iPad");
        assert_eq!(humanize_model("Macmini9,1"), "Mac mini");
        assert_eq!(humanize_model("MacPro7,1"), "Mac Pro");
        assert_eq!(humanize_model("Watch6,1"), "Apple Watch");
        assert_eq!(humanize_model("AudioAccessory5,1"), "HomePod");
    }

    #[test]
    fn humanize_model_leaves_readable_names_untouched() {
        assert_eq!(humanize_model("HP LaserJet Pro"), "HP LaserJet Pro");
        assert_eq!(humanize_model("BRAVIA KD-55X"), "BRAVIA KD-55X");
    }
}
