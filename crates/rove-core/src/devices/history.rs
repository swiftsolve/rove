//! Cross-scan accumulation of the flap-prone identity signals.
//!
//! mDNS, SSDP, HTTP-banner and open-port captures are gathered opportunistically
//! inside one short discovery window (see `DISCOVERY_WINDOW`) and travel over
//! lossy multicast / one-shot probes, so any single scan can miss a signal a
//! neighbouring scan saw. Classifying each scan from only that window's catch
//! makes a device's kind *flap*: a cast + HomeKit smart TV that answers
//! `_googlecast` (→ tv) on one scan and `_hap` (→ iot) on the next toggles
//! between "TV / Media" and "Smart home", since the strong mDNS service is the
//! single heaviest classifier vote and whichever one lands that window decides.
//!
//! This cache remembers, per MAC (IPs churn across scans), the strongest
//! identity signals ever observed for a device and merges each fresh scan into
//! it, so classification and the name/model derivation draw on the union of
//! everything seen — not one lossy window. It mirrors the passive DHCP
//! listener's MAC→hit accumulator: like that cache it lives for the process
//! lifetime (a restart re-learns within a few scans) and starts empty.
use super::banner::BannerHit;
use super::snmp::SnmpHit;
use super::ssdp::SsdpHit;
use crate::mdns::MdnsHit;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// The union of the flap-prone discovery signals for one device. Owned (not
/// borrowed from a single scan's maps) so it can outlive the scan that produced
/// it and be merged with later scans.
#[derive(Clone, Default)]
pub struct DeviceEvidence {
    pub mdns: MdnsHit,
    pub ssdp: SsdpHit,
    pub banner: BannerHit,
    pub snmp: SnmpHit,
    pub ports: Vec<u16>,
}

impl DeviceEvidence {
    /// Fold a fresh scan's signals into the accumulated evidence. mDNS uses its
    /// own strongest-kind rule ([`MdnsHit::absorb`]); the other string fields
    /// fill a gap they haven't already got, and open ports union — so a signal
    /// observed in any scan survives windows that miss it. Identity signals are
    /// effectively immutable for a given device, so "keep what we have, fill the
    /// rest" needs no freshness tie-break.
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

/// Copy `src` into `dst` only when `dst` is still empty — keeps the
/// first-observed value and never erases a known signal with a later absence.
fn fill(dst: &mut Option<String>, src: &Option<String>) {
    if dst.is_none() {
        if let Some(value) = src {
            *dst = Some(value.clone());
        }
    }
}

/// Lifetime accumulator keyed by MAC. Starts empty; grows as devices are seen,
/// like the DHCP cache it parallels.
static CACHE: LazyLock<Mutex<HashMap<String, DeviceEvidence>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Best display name ever resolved per MAC. Reverse-DNS and NetBIOS names flap
/// exactly like the mDNS/SSDP signals above — a lookup that times out or misses
/// its cache one scan yields nothing — but, unlike them, they aren't part of
/// `DeviceEvidence` (they're derived downstream, after this cache is consulted).
/// Remembering the winning name here keeps both the label *and* the kind stable:
/// a hostname-driven classification (e.g. a Kasa "HS103" plug → iot) stops
/// falling back to the bare vendor OUI (TP-Link → router) on a nameless scan.
static NAMES: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Merge this scan's `fresh` signals for `mac` into the accumulated evidence and
/// return the merged snapshot to classify from. The returned value carries every
/// signal ever seen for the device, so its kind stays stable across scans that
/// happen to miss a signal.
pub fn merge_and_snapshot(mac: &str, fresh: DeviceEvidence) -> DeviceEvidence {
    let mut cache = CACHE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let entry = cache.entry(mac.to_string()).or_default();
    entry.absorb(&fresh);
    entry.clone()
}

/// Remember the best display name resolved for `mac` and return the stable name
/// to show: this scan's `candidate` when it resolved one (also updating the
/// cache, so a genuine rename is picked up), else the last name ever seen. Keeps
/// a device from reverting to a bare-vendor label on a scan whose reverse-DNS /
/// NetBIOS lookup came back empty.
pub fn stable_name(mac: &str, candidate: Option<String>) -> Option<String> {
    let mut names = NAMES.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    match candidate {
        Some(name) => {
            names.insert(mac.to_string(), name.clone());
            Some(name)
        }
        None => names.get(mac).cloned(),
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
        // The flap fix: a TV whose `_googlecast` service (tv) lands one scan but
        // is missed the next must not fall back to whatever weaker signals the
        // empty window leaves.
        let mut acc = DeviceEvidence::default();
        acc.absorb(&DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });
        acc.absorb(&DeviceEvidence::default()); // a lossy window with no mDNS
        assert_eq!(acc.mdns.kind, Some("tv"));
    }

    #[test]
    fn dual_announced_kinds_resolve_stably_by_rank() {
        // A cast + HomeKit TV announces both tv and iot strong services. However
        // the two land across scans, the merged kind settles on the same winner
        // (iot outranks tv), so it stops toggling.
        let mut tv_first = DeviceEvidence::default();
        tv_first.absorb(&DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });
        tv_first.absorb(&DeviceEvidence { mdns: mdns_kind("iot"), ..Default::default() });

        let mut iot_first = DeviceEvidence::default();
        iot_first.absorb(&DeviceEvidence { mdns: mdns_kind("iot"), ..Default::default() });
        iot_first.absorb(&DeviceEvidence { mdns: mdns_kind("tv"), ..Default::default() });

        assert_eq!(tv_first.mdns.kind, Some("iot"));
        assert_eq!(iot_first.mdns.kind, iot_first.mdns.kind);
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
        // The Kasa-plug flap: reverse-DNS resolves "HS103" one scan and comes back
        // empty the next; the remembered name must carry through so the device
        // doesn't revert to its bare vendor label.
        let mac = "aa:bb:cc:00:00:02";
        assert_eq!(stable_name(mac, Some("HS103".into())).as_deref(), Some("HS103"));
        assert_eq!(stable_name(mac, None).as_deref(), Some("HS103"));
    }

    #[test]
    fn a_freshly_resolved_name_replaces_the_remembered_one() {
        // A genuine rename is picked up: a later non-empty candidate wins over the
        // cached value rather than being masked by it.
        let mac = "aa:bb:cc:00:00:03";
        stable_name(mac, Some("old-name".into()));
        assert_eq!(stable_name(mac, Some("new-name".into())).as_deref(), Some("new-name"));
        assert_eq!(stable_name(mac, None).as_deref(), Some("new-name"));
    }
}
