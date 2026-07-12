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
//! shown as reachable until it has both failed [`MISS_LIMIT`] consecutive scans
//! *and* stayed silent for at least [`MIN_ABSENCE`] of wall-clock time, then
//! flips to "Cached" — the UI's honest "we saw it recently but it's not
//! answering now" state. Any live scan resets both.
//!
//! The wall-clock floor matters because scans are **not** periodic: the UI fires
//! them on tab-open, manual refresh, or a network change (see `useDevices`), so
//! three can land within seconds. A pure miss count would then flip a present
//! device — a power-saving phone, or one whose TCP probe timed out under a
//! congested sweep — to "Cached" in that short burst, emitting a spurious
//! "dropped"/"reconnected" pair on the event feed. Requiring real elapsed time
//! absent means a burst of scans can't manufacture a departure.
//!
//! Like the identity accumulator in `history`, this state lives for the process
//! lifetime, is keyed by MAC (IPs churn across scans), and starts empty.
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// Consecutive missed scans before a device stops reading as reachable. Three
/// means neither one stray miss nor a phone dozing through a scan or two flips
/// the status — it takes a sustained absence. Phones in Wi-Fi power-save often
/// miss a probe while their radio is asleep, so a tighter limit flapped them to
/// "Offline" while they were still on the network.
const MISS_LIMIT: u32 = 3;

/// Minimum wall-clock time a device must stay silent before it reads as gone,
/// on top of [`MISS_LIMIT`]. Both conditions must hold. This is the guard
/// against bursty, event-driven scans (see the module note): a phone in Wi-Fi
/// power-save routinely goes quiet for a minute-plus, so a shorter floor still
/// flapped it. Ninety seconds is long enough to ride out a normal power-save
/// window yet short enough that a device truly gone reads "Cached" promptly.
const MIN_ABSENCE: Duration = Duration::from_secs(90);

/// Per-MAC debounce state: how many scans in a row have missed, and when the
/// device was last seen live (the anchor the absence floor is measured from).
struct Streak {
    misses: u32,
    last_live: Instant,
}

static STREAKS: LazyLock<Mutex<HashMap<String, Streak>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Fold this scan's liveness result for `mac` into its miss streak and return
/// whether the device should still read as reachable. A live scan clears the
/// streak; a miss extends it, and the device stays reachable until it has both
/// missed `MISS_LIMIT` scans in a row and been silent for `MIN_ABSENCE`.
pub fn reachable(mac: &str, live_now: bool) -> bool {
    reachable_at(mac, live_now, Instant::now())
}

/// [`reachable`] with the clock injected, so tests can advance time without
/// sleeping. `now` is monotonic; a live scan re-anchors `last_live` to it.
fn reachable_at(mac: &str, live_now: bool, now: Instant) -> bool {
    let mut streaks = crate::net_util::lock(&STREAKS);
    if live_now {
        streaks.remove(mac);
        return true;
    }
    let streak = streaks
        .entry(mac.to_string())
        .or_insert(Streak { misses: 0, last_live: now });
    streak.misses += 1;
    // Gone only when the miss count *and* the elapsed-absence floor both agree.
    // A burst of scans reaches MISS_LIMIT fast but not the wall-clock floor, so
    // it can't manufacture a departure.
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
        // Three misses in a two-second window — the bursty-scan case. The count
        // hits MISS_LIMIT but no real time has passed, so it holds reachable.
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
        // Third miss, but past MIN_ABSENCE of silence → genuinely gone.
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
        // A long time passes but only one scan missed — a lone probe long after
        // the last sighting shouldn't declare a departure on its own.
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
        // After the reset the clock restarts: misses right after the sighting
        // are inside a fresh MIN_ABSENCE window and stay reachable.
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(4)));
        assert!(reachable_at(mac, false, t0 + Duration::from_secs(5)));
        assert!(
            reachable_at(mac, false, t0 + Duration::from_secs(6)),
            "the absence floor is measured from the last sighting, not the process start",
        );
    }
}
