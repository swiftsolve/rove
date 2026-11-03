//! Cross-scan accumulation of the flap-prone identity signals.
//!
//! mDNS, SSDP, banner, SNMP and open-port signals come from one short discovery
//! window over lossy multicast and one-shot probes, so any scan can miss what
//! the last one saw. Classifying from one window makes a kind flap: a Cast and
//! HomeKit TV answering `_googlecast` (tv) one scan and `_hap` (iot) the next
//! toggles, since the strong mDNS service is the heaviest vote.
//!
//! So this keeps, per MAC (IPs churn), the union of every signal seen, and
//! classification and naming draw on that. Like the DHCP cache it lives for the
//! process and starts empty; a restart re-learns within a few scans.
use super::banner::BannerHit;
use super::snmp::SnmpHit;
use super::ssdp::SsdpHit;
use crate::devices::mdns::MdnsHit;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// The union of the flap-prone signals for one device, owned so it outlives
/// the scan that produced it.
#[derive(Clone, Default)]
pub struct DeviceEvidence {
    pub mdns: MdnsHit,
    pub ssdp: SsdpHit,
    pub banner: BannerHit,
    pub snmp: SnmpHit,
    pub ports: Vec<u16>,
}

impl DeviceEvidence {
    /// mDNS uses its strongest-kind rule ([`MdnsHit::absorb`]), strings only
    /// fill gaps and ports union. A device's identity barely changes, so "keep
    /// what we have" needs no freshness tie-break.
    fn absorb(&mut self, fresh: &DeviceEvidence) {
        self.mdns.absorb(&fresh.mdns);

        fill(&mut self.ssdp.name, &fresh.ssdp.name);
        fill(&mut self.ssdp.model, &fresh.ssdp.model);
        fill(&mut self.ssdp.manufacturer, &fresh.ssdp.manufacturer);
        fill(&mut self.ssdp.device_type, &fresh.ssdp.device_type);

        fill(&mut self.banner.server, &fresh.banner.server);
        fill(&mut self.banner.title, &fresh.banner.title);

        fill(&mut self.snmp.sys_descr, &fresh.snmp.sys_descr);

        for &port in &fresh.ports {
            if !self.ports.contains(&port) {
                self.ports.push(port);
            }
        }
        self.ports.sort_unstable();
    }
}

/// Keeps the first-seen value; a later absence never erases it.
fn fill(dst: &mut Option<String>, src: &Option<String>) {
    if dst.is_none() {
        dst.clone_from(src);
    }
}

static CACHE: LazyLock<Mutex<HashMap<String, DeviceEvidence>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// How authoritative a display name is, by source. `build_device`'s name chain
/// follows this order within a scan; the rank carries it across scans, so a
/// flap-prone reverse-DNS PTR can't overwrite a stronger remembered name.
/// Weakest first, so the derived `Ord` ranks `Mdns` highest.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum NameRank {
    /// A last-resort label, e.g. "Amazon Echo" from a fingerprint.
    Synthetic,
    /// The weakest real source; often a generic or model-ish name.
    ReverseDns,
    Dhcp,
    NetBios,
    /// UPnP friendlyName.
    Ssdp,
    /// The most human and authoritative.
    Mdns,
}

/// Best display name per MAC, with its [`NameRank`]. Reverse-DNS and NetBIOS
/// names flap like mDNS but aren't in `DeviceEvidence`, being resolved outside
/// it. Remembering the name keeps the label and the kind stable: an
/// "Office-LaserJet" stays a printer instead of falling back to its HP OUI
/// (computer) on a nameless scan.
static NAMES: LazyLock<Mutex<HashMap<String, (String, NameRank)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// Merge this scan's `fresh` signals for `mac` and return the union to
/// classify from.
pub fn merge_and_snapshot(mac: &str, fresh: DeviceEvidence) -> DeviceEvidence {
    let mut cache = crate::util::net::lock(&CACHE);
    let entry = cache.entry(mac.to_string()).or_default();
    entry.absorb(&fresh);
    entry.clone()
}

/// Remember the best name for `mac` and return the one to show. `candidate`
/// replaces the remembered name when its rank is equal (a real rename) or
/// stronger (an upgrade); a weaker one is ignored. With no candidate, the last
/// name stands, so the device doesn't revert to a bare vendor label.
pub fn stable_name(mac: &str, candidate: Option<(String, NameRank)>) -> Option<String> {
    let mut names = crate::util::net::lock(&NAMES);
    match candidate {
        Some((name, rank)) => {
            if let Some((stored, stored_rank)) = names.get(mac) {
                if rank < *stored_rank {
                    return Some(stored.clone());
                }
            }
            names.insert(mac.to_string(), (name.clone(), rank));
            Some(name)
        }
        None => names.get(mac).map(|(name, _)| name.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mdns_kind(kind: &'static str) -> MdnsHit {
        MdnsHit { kind: Some(kind), ..Default::default() }
    }

    #[test]
    fn a_strong_kind_survives_a_later_scan_that_saw_nothing() {
        // A TV whose `_googlecast` lands one scan and is missed the next keeps
        // its kind.
        let mut acc = DeviceEvidence::default();
        acc.absorb(&DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });
        acc.absorb(&DeviceEvidence::default()); // a lossy window with no mDNS
        assert_eq!(acc.mdns.kind, Some("tv"));
    }

    #[test]
    fn dual_announced_kinds_resolve_stably_by_rank() {
        // A Cast and HomeKit TV announces both tv and iot. Whatever order they
        // land in, the merge settles on iot, which outranks tv.
        let mut tv_first = DeviceEvidence::default();
        tv_first.absorb(&DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });
        tv_first.absorb(&DeviceEvidence { mdns: mdns_kind("iot"), ..Default::default() });

        let mut iot_first = DeviceEvidence::default();
        iot_first.absorb(&DeviceEvidence { mdns: mdns_kind("iot"), ..Default::default() });
        iot_first.absorb(&DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });

        assert_eq!(tv_first.mdns.kind, Some("iot"));
        assert_eq!(iot_first.mdns.kind, Some("iot"));
        assert_eq!(tv_first.mdns.kind, iot_first.mdns.kind);
    }

    #[test]
    fn string_signals_fill_gaps_and_ports_union() {
        let mut acc = DeviceEvidence::default();
        acc.absorb(&DeviceEvidence {
            ssdp: SsdpHit {
                device_type: Some("urn:schemas-upnp-org:device:MediaRenderer:1".into()),
                ..Default::default()
            },
            ports: vec![8009],
            ..Default::default()
        });
        acc.absorb(&DeviceEvidence {
            banner: BannerHit { title: Some("Living Room TV".into()), server: None },
            ports: vec![80, 8009],
            ..Default::default()
        });

        assert_eq!(acc.ssdp.device_type.as_deref(), Some("urn:schemas-upnp-org:device:MediaRenderer:1"));
        assert_eq!(acc.banner.title.as_deref(), Some("Living Room TV"));
        assert_eq!(acc.ports, vec![80, 8009]);
    }

    #[test]
    fn cache_accumulates_across_calls_for_one_mac() {
        let mac = "aa:bb:cc:00:00:01";
        merge_and_snapshot(mac, DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });
        let merged = merge_and_snapshot(mac, DeviceEvidence::default());
        assert_eq!(merged.mdns.kind, Some("tv"));
    }

    #[test]
    fn a_resolved_name_survives_a_later_nameless_scan() {
        // A Kasa plug's reverse DNS resolves "HS103" one scan and nothing the
        // next.
        let mac = "aa:bb:cc:00:00:02";
        assert_eq!(stable_name(mac, Some(("HS103".into(), NameRank::ReverseDns))).as_deref(), Some("HS103"));
        assert_eq!(stable_name(mac, None).as_deref(), Some("HS103"));
    }

    #[test]
    fn a_freshly_resolved_name_replaces_the_remembered_one_at_the_same_tier() {
        let mac = "aa:bb:cc:00:00:03";
        stable_name(mac, Some(("old-name".into(), NameRank::Mdns)));
        assert_eq!(stable_name(mac, Some(("new-name".into(), NameRank::Mdns))).as_deref(), Some("new-name"));
        assert_eq!(stable_name(mac, None).as_deref(), Some("new-name"));
    }

    #[test]
    fn a_stronger_signal_upgrades_the_remembered_name() {
        let mac = "aa:bb:cc:00:00:04";
        stable_name(mac, Some(("living-room".into(), NameRank::ReverseDns)));
        assert_eq!(stable_name(mac, Some(("Kitchen-Sonos".into(), NameRank::Mdns))).as_deref(), Some("Kitchen-Sonos"));
    }

    #[test]
    fn a_weaker_later_signal_does_not_downgrade_the_remembered_name() {
        // NetBIOS names it one scan, then misses, and reverse DNS resolves an
        // uglier model-ish string.
        let mac = "aa:bb:cc:00:00:05";
        stable_name(mac, Some(("Living-Room-Clock".into(), NameRank::NetBios)));
        assert_eq!(
            stable_name(mac, Some(("LenovoCD-24502F".into(), NameRank::ReverseDns))).as_deref(),
            Some("Living-Room-Clock")
        );
        assert_eq!(stable_name(mac, None).as_deref(), Some("Living-Room-Clock"));
    }
}
