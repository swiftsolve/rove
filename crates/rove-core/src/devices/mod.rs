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
mod liveness;
/// Public so diagnostics/examples (and the planned alerts feature) can drive the
/// passive listener and read captures directly.
pub mod dhcp;
pub mod hostname;
mod netbios;
mod probe;
mod snmp;
mod ssdp;
mod subnet;
mod sweep;

use crate::mdns;
use crate::network_info::{default_gateway, default_interface};
use crate::oui::{is_kind_ambiguous_vendor, is_randomized_mac, lookup_vendor};
use crate::platform::{neighbor_table, RawNeighbor};
use crate::types::{LanDevice, LanDeviceScan};
use std::time::Duration;

/// How long the sweep + mDNS window lasts. Both run concurrently, so this is
/// also (roughly) the total added latency of a scan.
const DISCOVERY_WINDOW: Duration = Duration::from_millis(3200);

/// The listen window for the passive refresh. mDNS/SSDP browse is multicast
/// (not per-host probing), so this is nearly free; it's the only liveness source
/// the refresh has on the stateless macOS/Windows ARP table, so it's given a full
/// window rather than a scan's share of one.
const PASSIVE_WINDOW: Duration = Duration::from_millis(2500);

/// SSDP window for the gateway-only identity probe (`gateway_identity`). Short —
/// we want just the router's own announcement, and the Connection panel that
/// waits on it should stay snappy.
const GATEWAY_SSDP_WINDOW: Duration = Duration::from_millis(2000);

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
            let (mdns_hits, ssdp_hits) = tokio::join!(
                mdns::discover(DISCOVERY_WINDOW),
                ssdp::discover(DISCOVERY_WINDOW, local_ipv4),
            );
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

    // Results stay aligned index-for-index with `in_scope` for the `zip` below.
    // Reverse-DNS, HTTP-banner and NetBIOS enrichment are independent — run them
    // together so their combined latency is one round, not three.
    // The gateway is a single known host we can probe purposefully: SNMP
    // `sysDescr` is the standard model source for network gear that never shows
    // up on mDNS/SSDP. Read-only `public` community, one host — see `snmp`.
    let ips: Vec<String> = in_scope.iter().map(|n| n.ip.clone()).collect();
    let (hostnames, banner_hits, netbios_hits, snmp_hits) = tokio::join!(
        hostname::resolve_many(&ips),
        banner::grab(&open_ports),
        netbios::query_many(&ips),
        snmp::discover(gateway.as_deref(), local_ipv4),
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
        snmp: &snmp_hits,
        netbios: &netbios_hits,
        dhcp: &dhcp_hits,
        open_ports: &open_ports,
        ping_live: &ping_live,
        tcp_live: &tcp_live,
        active_probe: subnet.is_some(),
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

/// A no-probe presence refresh for the background monitor. Reads the kernel
/// neighbor table and listens for mDNS/SSDP announcements — no ICMP sweep and no
/// TCP probe, so it adds essentially no per-host traffic (or battery cost) versus
/// a full [`scan`]. It returns only the devices it can *positively confirm are
/// present right now* and never asserts a departure: passive discovery can't
/// prove a device is gone (a silent host looks identical to a departed one,
/// especially on macOS/Windows whose ARP table carries no liveness state). The
/// caller ([`crate::store::Store::touch_devices`]) bumps `last_seen` for these and
/// leaves the rest of the roster untouched.
///
/// Cross-OS liveness: on Linux `ip neigh` reports a real REACHABLE state, which
/// counts on its own; on macOS/Windows the neighbor table is stateless, so a host
/// is confirmed only when it announced via mDNS or SSDP this window. Self and the
/// gateway are always present.
pub async fn passive_refresh() -> Vec<LanDevice> {
    let (gateway, interface) = tokio::join!(default_gateway(), default_interface());

    let subnet = match &interface {
        Some(name) => subnet::subnet_of(name).await,
        None => None,
    };

    let (self_ip, self_mac) = match &interface {
        Some(name) => crate::interfaces::address_of(name).await,
        None => (None, None),
    };
    let local_ipv4 = self_ip.as_deref().and_then(|s| s.parse::<std::net::Ipv4Addr>().ok());

    // Passive announcements only — a handful of multicast browse/M-SEARCH
    // datagrams, no host probing. This is the whole difference from `scan`,
    // which also runs the ping sweep and the per-host TCP probe.
    let (mdns_hits, ssdp_hits) =
        tokio::join!(mdns::discover(PASSIVE_WINDOW), ssdp::discover(PASSIVE_WINDOW, local_ipv4));

    let in_scope = neighbor_table()
        .await
        .into_iter()
        .filter(|n| subnet.as_deref().map(|s| subnet::contains(s, &n.ip)).unwrap_or(true));

    // Starts the background DHCP listener on first call (same as `scan`), so the
    // passive path keeps it alive even if the user never opens the Devices tab.
    let dhcp_hits = dhcp::snapshot();

    let mut devices: Vec<LanDevice> = in_scope
        .filter_map(|neighbor| {
            build_passive_device(
                neighbor,
                &mdns_hits,
                &ssdp_hits,
                &dhcp_hits,
                gateway.as_deref(),
                self_ip.as_deref(),
            )
        })
        .collect();

    add_self_if_missing(&mut devices, self_ip.as_deref(), self_mac.as_deref());
    devices.sort_by_key(|d| (!d.is_gateway, !d.is_self, subnet::ip_sort_key(&d.ip)));
    devices.dedup_by(|a, b| a.mac == b.mac);
    devices
}

/// Build a device for the passive refresh, or `None` when it can't be confirmed
/// present right now. Confirmation is OS-aware: a Linux `ip neigh` REACHABLE
/// state (`stateful` + `reachable`) stands on its own; on the stateless
/// macOS/Windows ARP table a host counts only when it announced via mDNS or SSDP
/// this window. Self and the gateway are always present.
///
/// Runs the same stateless classifier as a full scan over the passive evidence
/// it *does* have — OUI vendor, mDNS/SSDP names and types, and the DHCP
/// fingerprint — with no banner/port probing. Typing a genuinely new arrival
/// (rather than leaving it `unknown`) is what lets the event feed keep a new
/// router/AP at its higher-severity `ap_appeared` warning instead of a plain
/// join. `classify` is a pure function, so this touches none of the cross-scan
/// accumulators (`history`, `liveness`) an active scan owns. For a device the
/// store already knows this typing is ignored — `touch_devices` preserves the
/// richer active-scan identity — so it only ever fills in a fresh arrival.
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
    let present = is_self
        || is_gateway
        || (neighbor.stateful && neighbor.reachable)
        || mdns_hit.is_some()
        || ssdp_hit.is_some();
    if !present {
        return None;
    }

    let vendor = lookup_vendor(&neighbor.mac).map(String::from);
    let dhcp_hit = dhcp.get(&crate::net_util::normalize_mac_bare(&neighbor.mac));

    // Best passive name, most human first — the full scan's order minus the
    // active-only NetBIOS/reverse-DNS sources.
    let hostname = mdns_hit
        .and_then(|h| h.name.clone())
        .or_else(|| ssdp_hit.and_then(|h| h.name.clone()))
        .or_else(|| dhcp_hit.and_then(|h| h.hostname.clone()));

    // Withhold a kind-ambiguous OUI's vote (an ODM block that could be any of its
    // customers' gear), exactly as the full scan does.
    let classify_vendor =
        if is_kind_ambiguous_vendor(&neighbor.mac) { None } else { vendor.as_deref() };
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
        kind: verdict.kind.to_string(),
        kind_confidence: verdict.confidence.as_str(),
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        os: dhcp_hit.and_then(|hit| hit.os).map(String::from),
        vendor,
        hostname,
        model: None,
        is_gateway,
        is_self,
        reachable: true,
        ip: neighbor.ip,
        mac: neighbor.mac,
        last_seen: None,
    })
}

/// Best-effort identity of the default gateway, resolved cheaply for the
/// diagnostics Router panel (which shows the router but doesn't run a full
/// device scan). Every field is best-effort and may be `None`.
pub struct GatewayIdentity {
    /// The gateway's MAC, from the neighbor table.
    pub mac: Option<String>,
    /// Make from the MAC OUI.
    pub vendor: Option<String>,
    /// Model from SNMP `sysDescr`, or the UPnP `modelName` when the router answers
    /// SSDP but not SNMP.
    pub model: Option<String>,
    /// Human product name from the router's UPnP `friendlyName` (e.g. "Giga Hub
    /// 2.0 Internet Gateway Device"), or None when it doesn't announce over SSDP.
    pub name: Option<String>,
}

/// Resolve the gateway's make (MAC OUI), model and product name without a full
/// scan. Callers should ping the gateway first so its neighbor-table entry is
/// fresh; `local_ip`, when known, is the active interface address the SNMP/SSDP
/// probes bind to. Returns all-`None` when there is no gateway.
pub async fn gateway_identity(
    gateway: Option<&str>,
    local_ip: Option<std::net::Ipv4Addr>,
) -> GatewayIdentity {
    let Some(gw) = gateway else {
        return GatewayIdentity { mac: None, vendor: None, model: None, name: None };
    };
    let mac = neighbor_table()
        .await
        .into_iter()
        .find(|n| n.ip == gw)
        .map(|n| n.mac)
        .filter(|m| !m.is_empty());
    let vendor = mac.as_deref().and_then(lookup_vendor).map(String::from);

    // SNMP names the model on gear that answers it; SSDP adds the UPnP
    // friendlyName/modelName that most consumer routers announce instead. Run
    // both concurrently — neither blocks the other, and the panel takes whatever
    // either yields.
    let (snmp_hits, ssdp_hits) =
        tokio::join!(snmp::discover(gateway, local_ip), ssdp::discover(GATEWAY_SSDP_WINDOW, local_ip));
    let ssdp_hit = ssdp_hits.get(gw);
    let name = ssdp_hit.and_then(|hit| hit.name.clone());
    let model = snmp_hits
        .get(gw)
        .and_then(|hit| hit.model())
        .or_else(|| ssdp_hit.and_then(|hit| hit.model.clone()));
    GatewayIdentity { mac, vendor, model, name }
}

/// The per-scan lookup tables `build_device` draws on, all keyed by device IP.
/// Bundled so a device is enriched from one value rather than a long argument
/// list that grows with every new discovery source.
struct Enrichment<'a> {
    mdns: &'a std::collections::HashMap<String, mdns::MdnsHit>,
    ssdp: &'a std::collections::HashMap<String, ssdp::SsdpHit>,
    banner: &'a std::collections::HashMap<String, banner::BannerHit>,
    snmp: &'a std::collections::HashMap<String, snmp::SnmpHit>,
    netbios: &'a std::collections::HashMap<String, String>,
    dhcp: &'a std::collections::HashMap<String, dhcp::DhcpHit>,
    open_ports: &'a std::collections::HashMap<String, Vec<u16>>,
    /// IPs that replied to this scan's ICMP sweep — a positive liveness signal.
    ping_live: &'a std::collections::HashSet<String>,
    /// IPs that answered this scan's TCP probe — by accepting *or* refusing a
    /// connection. Either proves the host is alive even when it drops ICMP and
    /// announces nothing (a phone asleep in Wi-Fi power-save still RSTs a SYN).
    tcp_live: &'a std::collections::HashSet<String>,
    /// Whether this scan actually ran the active probes (sweep/TCP). False only
    /// when the subnet is unknown, in which case there's nothing to derive
    /// liveness from and the scan falls back to the neighbor table's own state.
    active_probe: bool,
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
    let dhcp = enrichment.dhcp.get(&crate::net_util::normalize_mac_bare(&neighbor.mac));

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
        snmp: enrichment.snmp.get(&neighbor.ip).cloned().unwrap_or_default(),
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
    // Each source is tagged with its strength rank so the per-MAC name cache below
    // can honour this same order across scans — a weaker signal resolved later
    // (a flap-prone reverse-DNS PTR) must not overwrite a stronger one remembered
    // from an earlier scan.
    use history::NameRank;
    let hostname = evidence
        .mdns
        .name
        .clone()
        .map(|n| (n, NameRank::Mdns))
        .or_else(|| evidence.ssdp.name.clone().map(|n| (n, NameRank::Ssdp)))
        .or_else(|| enrichment.netbios.get(&neighbor.ip).cloned().map(|n| (n, NameRank::NetBios)))
        .or_else(|| dhcp.and_then(|hit| hit.hostname.clone()).map(|n| (n, NameRank::Dhcp)))
        .or_else(|| resolved_hostname.map(|n| (n, NameRank::ReverseDns)))
        .or_else(|| is_echo.then(|| ("Amazon Echo".to_string(), NameRank::Synthetic)));

    // Reverse-DNS / NetBIOS names (often the only label a plug or printer exposes)
    // flap across scans, and a nameless scan would drop the hostname classify vote
    // and revert the device to its bare vendor kind (an "Office-LaserJet" printer
    // falling back to its HP OUI → computer). Remember the resolved name per-MAC so
    // it — and the kind derived from it below — stays put. A MAC-less host can't be
    // keyed.
    let hostname = if neighbor.mac.is_empty() {
        hostname.map(|(name, _)| name)
    } else {
        history::stable_name(&neighbor.mac, hostname)
    };

    // A hardware model from mDNS TXT is the most precise; SSDP's modelName next;
    // then the gateway's SNMP `sysDescr` (the only model source for most routers,
    // which announce on neither mDNS nor SSDP).
    let model = evidence
        .mdns
        .model
        .clone()
        .or_else(|| evidence.ssdp.model.clone())
        .or_else(|| evidence.snmp.model());

    // An Echo is fundamentally a speaker; keep that label even when it also acts
    // as a Matter/Thread hub (a strong `iot` vote that would otherwise win).
    let verdict = if is_echo {
        classify::Verdict { kind: "speaker", confidence: classify::Confidence::High }
    } else {
        // Read the vendor for display, but withhold its kind vote when the OUI's
        // registrant is too kind-ambiguous to type (see `is_kind_ambiguous_vendor`):
        // a lone "Motorola (Wuhan)" ODM block is a Lenovo smart-home device, not a
        // Motorola phone, so it must fall back to a real signal rather than guess.
        let classify_vendor =
            if is_kind_ambiguous_vendor(&neighbor.mac) { None } else { vendor.as_deref() };
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

    // A privacy-randomized MAC has no OUI vendor, but an Apple handheld still
    // gives away its maker — an mDNS/UPnP model like "iPhone15,2" or a default
    // Apple hostname ("iPhone", "Jane's-iPad"). Surface that so a randomized
    // iPhone reads "Phone · Apple" instead of dropping the make. Kept out of the
    // classifier above, which stays on the authoritative OUI vendor.
    let vendor = vendor.or_else(|| infer_vendor(hostname.as_deref(), model.as_deref()));

    // Turn a raw hardware identifier into a name a person recognizes:
    // "MacBookPro18,1" reads as "MacBook Pro", not a part number. Done after
    // vendor inference above, which needs the raw "<family><gen>,<rev>" shape.
    let model = model.map(|m| humanize_model(&m));

    // Liveness. On macOS/Windows the neighbor table carries no state, so a
    // departed device lingers in the ARP cache and would otherwise read "Online"
    // for ~20 min. Decide from this scan's active probes instead: an ICMP reply,
    // a TCP answer (an open port *or* a RST from a closed one), or any
    // announcement (mDNS/SSDP/NetBIOS/SNMP/banner) means the device answered
    // *now*. The TCP answer is what keeps a power-saving phone — which ignores
    // ICMP and announces nothing but still RSTs a SYN — from reading "Offline".
    // On Linux a genuine REACHABLE state counts too. Self and the gateway are
    // always present. The result is debounced by MAC (see `liveness`) so one
    // dropped probe doesn't flip a device to "Cached".
    let reachable = if is_self || is_gateway {
        true
    } else if !enrichment.active_probe {
        // No active probe ran (unknown subnet) — nothing better than the table.
        neighbor.reachable
    } else {
        let ip = neighbor.ip.as_str();
        let live_now = (neighbor.stateful && neighbor.reachable)
            || enrichment.ping_live.contains(ip)
            || enrichment.tcp_live.contains(ip)
            || enrichment.mdns.contains_key(ip)
            || enrichment.ssdp.contains_key(ip)
            || enrichment.netbios.contains_key(ip)
            || enrichment.snmp.contains_key(ip)
            || enrichment.banner.contains_key(ip);
        if neighbor.mac.is_empty() {
            live_now // no stable key to debounce against
        } else {
            liveness::reachable(&neighbor.mac, live_now)
        }
    };

    LanDevice {
        kind: verdict.kind.to_string(),
        kind_confidence: verdict.confidence.as_str(),
        is_randomized_mac: is_randomized_mac(&neighbor.mac),
        os: dhcp.and_then(|hit| hit.os).map(String::from),
        vendor,
        hostname,
        model,
        is_gateway,
        is_self,
        reachable,
        ip: neighbor.ip,
        mac: neighbor.mac,
        // Stamped by the store's roster merge (see `devices_with_offline`); a
        // bare scan has no timestamp of its own.
        last_seen: None,
    }
}

/// Infer the maker when the OUI lookup came up empty (a privacy-randomized MAC).
/// Currently Apple-only: Apple handhelds randomize their MAC yet still give
/// themselves away by an mDNS/UPnP model identifier ("iPhone15,2", "iPad13,4")
/// or a default Apple hostname ("iPhone", "Jane's-iPad"), so the make is still
/// recoverable. Best-effort — other brands rarely both randomize *and*
/// self-label, so they stay `None` rather than risk a wrong guess.
fn infer_vendor(hostname: Option<&str>, model: Option<&str>) -> Option<String> {
    if model.is_some_and(is_apple_model) || hostname.is_some_and(is_apple_hostname) {
        return Some("Apple".to_string());
    }
    None
}

/// An Apple hardware model identifier: a product family followed by a
/// "<generation>,<revision>" suffix, e.g. "iPhone15,2" or "MacBookPro18,3". The
/// comma-number shape is what separates the model from a bare "iPad" hostname.
fn is_apple_model(model: &str) -> bool {
    const FAMILIES: [&str; 9] =
        ["iphone", "ipad", "ipod", "watch", "macbook", "imac", "macmini", "macpro", "audioaccessory"];
    let lower = model.trim().to_ascii_lowercase();
    lower.contains(',')
        && lower.bytes().any(|b| b.is_ascii_digit())
        && FAMILIES.iter().any(|family| lower.starts_with(family))
}

/// Turn a hardware model string into a human-friendly product name. Apple's
/// mDNS/UPnP identifiers ("MacBookPro18,1", "iPhone15,2", "AudioAccessory5,1")
/// are the main offenders: they pack a product family together with a
/// "<generation>,<revision>" suffix that means nothing to a person. Strip the
/// suffix and expand the CamelCase family into spaced words, mapping the few
/// families whose marketing name differs from the identifier. Anything that
/// isn't a recognized Apple identifier (a router's SNMP `sysDescr`, an SSDP
/// `modelName`) is already human-readable and passes through untouched.
fn humanize_model(model: &str) -> String {
    if !is_apple_model(model) {
        return model.to_string();
    }
    // Everything before the "<gen>,<rev>" suffix is the product family.
    let family: String = model.trim().chars().take_while(|c| !c.is_ascii_digit()).collect();
    match family.to_ascii_lowercase().as_str() {
        "audioaccessory" => "HomePod".to_string(),
        "watch" => "Apple Watch".to_string(),
        "macmini" => "Mac mini".to_string(),
        "macpro" => "Mac Pro".to_string(),
        // "MacBook" is one brand word, so only the trailing tier is split off.
        "macbook" => "MacBook".to_string(),
        "macbookpro" => "MacBook Pro".to_string(),
        "macbookair" => "MacBook Air".to_string(),
        // Lowercase-run families ("iphone", "ipad", "imac", "ipod") are a single
        // word; keep the identifier's own casing rather than lowercasing it.
        _ => family,
    }
}

/// A hostname that names an Apple product — the platform default ("iPhone") or a
/// personalized form ("Janes-iPad", "Apple-Watch"). Matched as substrings so the
/// possessive/prefixed variants are covered.
fn is_apple_hostname(hostname: &str) -> bool {
    const MARKERS: [&str; 10] = [
        "iphone", "ipad", "ipod", "macbook", "imac", "macmini", "mac-mini", "airpods",
        "apple-watch", "apple watch",
    ];
    let lower = hostname.to_ascii_lowercase();
    MARKERS.iter().any(|marker| lower.contains(marker))
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
        let (ssdp, banner, snmp, netbios, dhcp, ports) = (
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
        );
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
            active_probe: true,
        };
        let neighbor =
            RawNeighbor { ip: ip.to_string(), mac: mac.to_string(), reachable: true, stateful: true };
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
            reachable: true,
            stateful: true,
        };
        assert!(build_passive_device(reachable, &mdns, &ssdp, &dhcp, None, None).is_some());
        // A STALE entry (stateful but not reachable) that announces nothing is not
        // confirmable passively — leave it to an active scan.
        let stale = RawNeighbor {
            ip: "192.168.1.6".into(),
            mac: "aa:bb:cc:dd:ee:02".into(),
            reachable: false,
            stateful: true,
        };
        assert!(build_passive_device(stale, &mdns, &ssdp, &dhcp, None, None).is_none());
    }

    #[test]
    fn passive_does_not_trust_a_stateless_arp_entry_without_an_announcement() {
        // macOS/Windows `arp -a` reports reachable=true but stateful=false — a
        // placeholder, not liveness. A device that has left lingers here for ~20
        // min, so without an mDNS/SSDP announcement it must not read as present.
        let (mut mdns, ssdp, dhcp) =
            (HashMap::new(), HashMap::<String, ssdp::SsdpHit>::new(), HashMap::new());
        let bare = RawNeighbor {
            ip: "192.168.1.7".into(),
            mac: "aa:bb:cc:dd:ee:03".into(),
            reachable: true,
            stateful: false,
        };
        assert!(
            build_passive_device(bare, &mdns, &ssdp, &dhcp, None, None).is_none(),
            "a stale ARP-cache entry must not be confirmed present"
        );

        // The same kind of host, now announcing over mDNS → confirmed, and its
        // announced name is carried through for a fresh arrival.
        mdns.insert(
            "192.168.1.8".into(),
            mdns::MdnsHit { name: Some("Living Room TV".into()), ..Default::default() },
        );
        let announcing = RawNeighbor {
            ip: "192.168.1.8".into(),
            mac: "aa:bb:cc:dd:ee:04".into(),
            reachable: true,
            stateful: false,
        };
        let dev = build_passive_device(announcing, &mdns, &ssdp, &dhcp, None, None)
            .expect("announced host");
        assert!(dev.reachable);
        assert_eq!(dev.hostname.as_deref(), Some("Living Room TV"));
    }

    #[test]
    fn passive_always_confirms_self_and_gateway() {
        // Self and the gateway are present by definition — even a gateway whose
        // ARP entry looks stale and that announced nothing must be confirmed.
        let (mdns, ssdp, dhcp) = (HashMap::new(), HashMap::new(), HashMap::new());
        let gw = RawNeighbor {
            ip: "192.168.1.1".into(),
            mac: "aa:bb:cc:dd:ee:05".into(),
            reachable: false,
            stateful: false,
        };
        let dev = build_passive_device(gw, &mdns, &ssdp, &dhcp, Some("192.168.1.1"), None)
            .expect("the gateway is always present");
        assert!(dev.is_gateway);
    }

    #[test]
    fn passive_types_a_new_router_so_it_keeps_its_ap_warning() {
        // The event feed logs a new non-gateway router/AP as a higher-severity
        // `ap_appeared` warning — but only if the arrival is actually typed a
        // router. The lightweight classify pass must carry a DHCP router
        // fingerprint through so a rogue AP joining while backgrounded isn't
        // downgraded to a plain join.
        let (mdns, ssdp) = (HashMap::new(), HashMap::new());
        let mut dhcp: HashMap<String, dhcp::DhcpHit> = HashMap::new();
        dhcp.insert(
            crate::net_util::normalize_mac_bare("aa:bb:cc:dd:dd:06"),
            dhcp::DhcpHit { kind: Some("router"), ..Default::default() },
        );
        let ap = RawNeighbor {
            ip: "192.168.1.9".into(),
            mac: "aa:bb:cc:dd:dd:06".into(),
            reachable: true,
            stateful: true,
        };
        let dev = build_passive_device(ap, &mdns, &ssdp, &dhcp, None, None).expect("present");
        assert_eq!(dev.kind, "router", "a router fingerprint types the arrival as router");
        assert!(!dev.is_gateway, "and not the gateway → emit_new_device raises ap_appeared");
    }

    #[test]
    fn a_tcp_answer_alone_reads_a_stateless_device_as_reachable() {
        // The reported case: a randomized-MAC phone asleep in Wi-Fi power-save
        // drops ICMP and announces nothing, so ping_live and every announcement
        // map is empty. But it RSTs a SYN to a closed port, which probe::probe
        // records in `responsive` → tcp_live. With a stateless neighbor entry
        // (macOS arp -a: reachable but not `stateful`), that TCP answer is the
        // only live signal — and it must be enough to read "Online".
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
            active_probe: true,
        };
        let neighbor = RawNeighbor {
            ip: "192.168.2.35".to_string(),
            mac: "a6:80:ee:e0:f8:f7".to_string(),
            reachable: true,
            stateful: false,
        };
        let device = build_device(neighbor, None, &enrichment, None, None);
        assert!(device.reachable, "a TCP RST/accept is a live signal on its own");
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

    #[test]
    fn a_motorola_wuhan_odm_oui_is_not_confidently_typed_a_phone() {
        // The reported case: a Lenovo speaker on 08:38:E6 ("Motorola (Wuhan)
        // Mobility" ODM) resolves to a bare "Motorola" vendor and used to be typed
        // a phone. With no other signal it must fall back to a generic device, not
        // a confident (and wrong) "phone" — the vendor still shows for display.
        let device = device_with_mdns("08:38:e6:d8:df:23", "192.168.2.19", mdns::MdnsHit::default());
        assert_eq!(device.vendor.as_deref(), Some("Motorola"));
        assert_ne!(device.kind, "phone");
        assert_eq!(device.kind, "unknown");

        // A Motorola-brand phone block (00:62:01, "Motorola Mobility LLC, a Lenovo
        // Company") tidies to the same "Motorola" but stays a phone.
        let phone = device_with_mdns("00:62:01:00:00:22", "192.168.2.29", mdns::MdnsHit::default());
        assert_eq!(phone.vendor.as_deref(), Some("Motorola"));
        assert_eq!(phone.kind, "phone");
    }

    #[test]
    fn apple_model_and_hostname_infer_an_apple_vendor() {
        // The reported case: a randomized-MAC iPhone has no OUI vendor, but its
        // model or default hostname still identifies the maker.
        assert_eq!(infer_vendor(None, Some("iPhone15,2")).as_deref(), Some("Apple"));
        assert_eq!(infer_vendor(Some("iPhone"), None).as_deref(), Some("Apple"));
        assert_eq!(infer_vendor(Some("Janes-iPad"), None).as_deref(), Some("Apple"));
        assert_eq!(infer_vendor(Some("Apple-Watch"), None).as_deref(), Some("Apple"));
    }

    #[test]
    fn non_apple_signals_infer_no_vendor() {
        // A bare "iPad"-less hostname or a non-Apple model must not be guessed.
        assert!(infer_vendor(Some("Galaxy-S21"), None).is_none());
        assert!(infer_vendor(Some("living-room"), Some("BRAVIA KD-55X")).is_none());
        assert!(infer_vendor(None, None).is_none());
    }

    #[test]
    fn a_bare_ipad_model_string_is_not_mistaken_for_a_model_id() {
        // "iPad" alone (no ",<rev>") is a hostname, not a hardware model id, so
        // is_apple_model must reject it — hostname matching covers that case.
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
        // A router's SNMP sysDescr or an SSDP modelName is already human-readable.
        assert_eq!(humanize_model("HP LaserJet Pro"), "HP LaserJet Pro");
        assert_eq!(humanize_model("BRAVIA KD-55X"), "BRAVIA KD-55X");
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
        kind_confidence: "high",
        is_randomized_mac: is_randomized_mac(mac),
        is_gateway: false,
        is_self: true,
        reachable: true,
        last_seen: None,
    });
}
