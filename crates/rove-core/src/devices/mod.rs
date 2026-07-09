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
mod snmp;
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

/// Best-effort identity of the default gateway, resolved cheaply for the
/// diagnostics Router panel (which shows the router but doesn't run a full
/// device scan). Every field is best-effort and may be `None`.
pub struct GatewayIdentity {
    /// The gateway's MAC, from the neighbor table.
    pub mac: Option<String>,
    /// Make from the MAC OUI.
    pub vendor: Option<String>,
    /// Model from SNMP `sysDescr` — the one model source most routers expose.
    pub model: Option<String>,
}

/// Resolve the gateway's vendor (MAC OUI) and model (SNMP `sysDescr`) without a
/// full scan. Callers should ping the gateway first so its neighbor-table entry
/// is fresh; `local_ip`, when known, is the active interface address the SNMP
/// probe binds to. Returns all-`None` when there is no gateway.
pub async fn gateway_identity(
    gateway: Option<&str>,
    local_ip: Option<std::net::Ipv4Addr>,
) -> GatewayIdentity {
    let Some(gw) = gateway else {
        return GatewayIdentity { mac: None, vendor: None, model: None };
    };
    let mac = neighbor_table()
        .await
        .into_iter()
        .find(|n| n.ip == gw)
        .map(|n| n.mac)
        .filter(|m| !m.is_empty());
    let vendor = mac.as_deref().and_then(lookup_vendor).map(String::from);
    let model = snmp::discover(gateway, local_ip).await.get(gw).and_then(|hit| hit.model());
    GatewayIdentity { mac, vendor, model }
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
        let enrichment = Enrichment {
            mdns: &mdns_map,
            ssdp: &ssdp,
            banner: &banner,
            snmp: &snmp,
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
        is_randomized_mac: is_randomized_mac(mac),
        is_gateway: false,
        is_self: true,
        reachable: true,
    });
}
