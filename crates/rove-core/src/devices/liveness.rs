//! Cross-scan reachability debounce.
//!
//! On macOS and Windows the neighbor table (`arp -a`) carries no liveness state,
//! so a device that has left lingers in the ARP cache, reading Online, for up to
//! ~20 minutes until the OS ages it out. So each scan probes every device (an
//! ICMP reply, an open or refusing TCP port, or an mDNS/SSDP/NetBIOS/SNMP answer
//! counts as live) and feeds the yes/no here.
//!
//! One miss isn't proof a device is gone: a phone briefly asleep, a lossy
//! multicast window or a dropped ping all miss. So a device stays reachable
//! until it has both missed [`MISS_LIMIT`] scans in a row and stayed silent for
//! [`MIN_ABSENCE`], then reads Offline. Any live scan resets both.
//!
//! The time floor matters because scans aren't periodic: the UI fires them on
//! tab open, manual refresh or a network change (see `useDevices`), so three can
//! land within seconds. A pure miss count would flip a present device to Offline
//! in that burst and put a spurious dropped/reconnected pair on the event feed.
//!
//! Like the identity accumulator in `history`, this state lives for the process,
//! is keyed by MAC (IPs churn across scans) and starts empty.
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// Consecutive missed scans before a device stops reading as reachable. Phones
/// in Wi-Fi power-save often miss a probe while their radio sleeps, and a
/// tighter limit flapped them to Offline while still on the network.
const MISS_LIMIT: u32 = 3;

/// Minimum silence before a device reads as gone, on top of [`MISS_LIMIT`]; the
/// guard against bursty scans. A phone in power-save routinely goes quiet for a
/// minute or more, so a shorter floor still flapped it; 90 s rides that out yet
/// lets a device that's really gone read Offline promptly.
const MIN_ABSENCE: Duration = Duration::from_secs(90);

/// Per-MAC miss streak. A live scan removes the entry, so `last_live` is set at
/// the first miss after it: the absence floor runs from there.
struct Streak {
    misses: u32,
    last_live: Instant,
}

static STREAKS: LazyLock<Mutex<HashMap<String, Streak>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Fold this scan's result for `mac` into its miss streak and return whether
/// the device still reads as reachable.
pub fn reachable(mac: &str, live_now: bool) -> bool {
    reachable_at(mac, live_now, Instant::now())
}

/// [`reachable`] with the clock injected, so tests advance time without sleeping.
fn reachable_at(mac: &str, live_now: bool, now: Instant) -> bool {
    let mut streaks = crate::util::net::lock(&STREAKS);
    if live_now {
        streaks.remove(mac);
        return true;
    }
    let streak = streaks
        .entry(mac.to_string())
        .or_insert(Streak { misses: 0, last_live: now });
    streak.misses += 1;
    let long_enough = now.duration_since(streak.last_live) >= MIN_ABSENCE;
    !(streak.misses >= MISS_LIMIT && long_enough)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_burst_of_misses_within_the_floor_stays_reachable() {
        let mac = "aa:bb:cc:00:00:10";
        let t0 = Instant::now();
        assert!(reachable_at(mac, true, t0), "a live device is reachable");
        // Three misses in two seconds, the bursty-scan case: the count hits
        // MISS_LIMIT but no real time has passed.
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(1)));
        assert!(reachable_at(mac, false, t0 + Duration::from_millis(1500)));
        assert!(
            reachable_at(mac, false, t0 + Duration::from_secs(2)),
            "three rapid misses must not flip a still-present device to cached",
        );
    }

    #[test]
    fn flips_only_after_both_the_count_and_the_absence_floor() {
        let mac = "aa:bb:cc:00:00:11";
        let t0 = Instant::now();
        assert!(reachable_at(mac, true, t0));
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(1)), "miss 1");
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(2)), "miss 2");
        // Third miss, and past MIN_ABSENCE: really gone.
        assert!(
            !reachable_at(mac, false, t0 + Duration::from_secs(120)),
            "three misses plus a real absence flips to cached",
        );
    }

    #[test]
    fn the_absence_floor_alone_is_not_enough() {
        let mac = "aa:bb:cc:00:00:12";
        let t0 = Instant::now();
        assert!(reachable_at(mac, true, t0));
        // A lone miss long after the last sighting isn't a departure.
        assert!(
            reachable_at(mac, false, t0 + Duration::from_secs(300)),
            "one miss stays reachable no matter how much time has elapsed",
        );
    }

    #[test]
    fn a_live_scan_resets_both_the_count_and_the_clock() {
        let mac = "aa:bb:cc:00:00:13";
        let t0 = Instant::now();
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(1))); // miss 1
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(2))); // miss 2
        assert!(reachable_at(mac, true, t0 + Duration::from_secs(3)), "seen again → cleared");
        // After the reset the clock restarts, so these misses sit inside a fresh
        // MIN_ABSENCE window.
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(4)));
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(5)));
        assert!(
            reachable_at(mac, false, t0 + Duration::from_secs(6)),
            "the absence floor is measured from the last sighting, not the process start",
        );
    }
}
