//! Cross-scan reachability debounce.
//!
//! On macOS/Windows the neighbor table (`arp -a`) carries no liveness state, so
//! a device that has left lingers in the ARP cache — and thus reads as "Online"
//! — for up to ~20 minutes until the OS ages the entry out. To reflect reality
//! sooner, each scan actively probes every device (ICMP sweep reply, an open TCP
//! port, or an mDNS/SSDP/NetBIOS/SNMP announcement all count as a live signal)
//! and feeds the yes/no result here.
//!
//! A single missed probe is not proof a device is gone: a phone briefly asleep,
//! a lossy multicast window, or one dropped ping all miss. So a device stays
//! shown as reachable until it fails [`MISS_LIMIT`] consecutive scans, then
//! flips to "Cached" — the UI's honest "we saw it recently but it's not
//! answering now" state. Any live scan resets the streak.
//!
//! Like the identity accumulator in `history`, this state lives for the process
//! lifetime, is keyed by MAC (IPs churn across scans), and starts empty.
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// Consecutive missed scans before a device stops reading as reachable. Three
/// means neither one stray miss nor a phone dozing through a scan or two flips
/// the status — it takes a sustained absence. Phones in Wi-Fi power-save often
/// miss a probe while their radio is asleep, so a tighter limit flapped them to
/// "Offline" while they were still on the network.
const MISS_LIMIT: u32 = 3;

static MISSES: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Fold this scan's liveness result for `mac` into its miss streak and return
/// whether the device should still read as reachable. A live scan clears the
/// streak; a miss extends it, and the device stays reachable until it has missed
/// `MISS_LIMIT` scans in a row.
pub fn reachable(mac: &str, live_now: bool) -> bool {
    let mut misses = crate::net_util::lock(&MISSES);
    if live_now {
        misses.remove(mac);
        return true;
    }
    let count = misses.entry(mac.to_string()).or_insert(0);
    *count += 1;
    *count < MISS_LIMIT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stays_reachable_until_three_consecutive_misses() {
        let mac = "aa:bb:cc:00:00:10";
        assert!(reachable(mac, true), "a live device is reachable");
        assert!(reachable(mac, false), "one miss still reads reachable");
        assert!(reachable(mac, false), "two misses still reads reachable");
        assert!(!reachable(mac, false), "the third consecutive miss flips to cached");
        assert!(!reachable(mac, false), "and it stays cached while still missing");
    }

    #[test]
    fn a_live_scan_resets_the_streak() {
        let mac = "aa:bb:cc:00:00:11";
        assert!(reachable(mac, false)); // miss 1
        assert!(reachable(mac, false)); // miss 2
        assert!(reachable(mac, true)); // seen again → streak cleared
        assert!(reachable(mac, false), "after a reset it takes three fresh misses again");
        assert!(reachable(mac, false));
        assert!(!reachable(mac, false));
    }
}
