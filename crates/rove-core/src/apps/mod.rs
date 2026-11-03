//! Per-app network usage: how many bytes each app has moved, and (in `hosts`)
//! which hosts and traffic types they moved it to.
//!
//! [`crate::usage`] meters the interface as a whole. This attributes
//! bytes to the process that moved them, without packet capture (no
//! libpcap/Npcap):
//!
//!   * **Linux**: `ss -tinHp` reads each socket's `TCP_INFO`
//!     (`bytes_sent`/`bytes_received`) with its owning process. Unprivileged for
//!     your own sockets; no eBPF.
//!   * **macOS**: `nettop` lists each process's sockets beneath it with
//!     cumulative bytes, TCP and UDP alike. Sockets whose peer isn't a host on
//!     the network (unconnected mDNS, loopback) are dropped by
//!     `utils::net::routable_peer_ip`.
//!   * **Windows**: an ETW consumer of `Microsoft-Windows-Kernel-Network` (see
//!     `etw`) folds every send/receive event into a per-process total.
//!     Starting the session needs administrator rights, so the platform reads
//!     as unsupported, not empty, until it's up.
//!   * **other**: no per-process source, so unsupported.
//!
//! [`AppUsageTracker`] diffs each cumulative counter against its last reading
//! and banks the delta per app. On Linux and macOS that's per socket, so a
//! socket that opens and closes between two samples is missed (the same limit
//! Sniffnet and other snapshot tools have); one that lives across a tick counts
//! in full. ETW sees every event, so Windows misses nothing.
//!
//! # Why not `nettop -P`
//!
//! `nettop -P` gives a per-process total, and Rove shipped reading it, wrongly.
//! It's the sum over the process's *currently open* sockets: a gauge, not an
//! odometer. When a socket closes, its bytes leave the sum.
//!
//! No accumulation fixes that, because the loss happens before Rove sees the
//! number. Banking every rise re-banks history each time the sum dips and
//! recovers, inventing traffic. Crediting nothing on a dip loses what the
//! surviving sockets moved that tick, which for a download or a browser
//! (connections finishing and being replaced) is most of the traffic.
//!
//! The per-socket rows carry the same bytes with nothing lost: the `-P` row is
//! exactly their sum, and a close shows as one key going away rather than an
//! unattributable dip.

pub mod hosts;

use crate::usage::ByteCounts;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

// One source per OS behind the same `sys` API (`SEMANTICS`, `support`,
// `support_detail`, `sample_units`, `sample_peers`), so this module and `hosts`
// carry no per-OS branches. The Linux and macOS parsers build in every test run.
#[cfg(windows)]
mod etw;
#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(any(target_os = "macos", test))]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
use linux as sys;
#[cfg(target_os = "macos")]
use macos as sys;
#[cfg(windows)]
use windows as sys;

/// No per-process source here, so every view reads as unsupported.
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
mod sys {
    use super::hosts::PeerReading;
    use super::Support;
    use super::{CounterSemantics, UsageUnit};

    // Nothing is ever sampled, so the choice doesn't matter.
    pub(super) const SEMANTICS: CounterSemantics = CounterSemantics::Socket;

    pub(super) fn support() -> Support {
        Support::Unsupported
    }

    pub(super) fn support_detail() -> Option<String> {
        None
    }

    pub(super) async fn sample_units() -> Option<Vec<UsageUnit>> {
        None
    }

    pub(super) async fn sample_peers() -> Option<Vec<PeerReading>> {
        None
    }
}

/// Whether this platform can meter per-app traffic right now. Mirrors
/// `AppUsageSupport` in `src/types/app-usage.ts`: when `Unsupported` the UI
/// explains why instead of showing an empty list.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Support {
    Supported,
    Unsupported,
}

/// One app's network usage since Rove started watching, summed over every
/// process with that name. Traffic to a loopback or wildcard peer is excluded,
/// the rule the Hosts view uses (`utils::net::routable_peer_ip`). The same
/// traffic by remote host is [`AppHosts`](crate::apps::hosts::AppHosts).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    pub name: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    /// The app's OS icon as a `data:` URI (see [`crate::platform::app_icon`]),
    /// or `None` for helpers, daemons and CLIs, where the UI shows a favicon or
    /// monogram.
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsageSummary {
    /// Per-app totals, busiest first. Empty before the first sample.
    pub apps: Vec<AppUsage>,
    /// See [`platform_support`]. When `Unsupported` the UI explains why
    /// instead of showing an empty list.
    pub support: Support,
    /// Epoch ms of the first sample, or null before then.
    pub tracking_since: Option<u64>,
}

/// `Supported` on Linux and macOS, and on Windows while the ETW session is up
/// (it needs admin, so a runtime check there); `Unsupported` otherwise.
pub fn platform_support() -> Support {
    crate::apps::sys::support()
}

/// Why per-app usage (and, on the same session, Hosts and Traffic) is
/// unavailable, for the UI's unsupported state: the last ETW start error on
/// Windows; `None` once it's running, and on every other platform.
pub fn support_detail() -> Option<String> {
    crate::apps::sys::support_detail()
}

/// One snapshot of per-unit cumulative byte counters: a socket's on Linux and
/// macOS, a process instance's on Windows.
///
/// `None` means no sample was taken (tool missing, failed, timed out, or an
/// unsupported platform); `Some(vec![])` means nothing to report. Keep them
/// apart: ingesting a failure as empty would drop every baseline, and the next
/// good tick would re-credit each unit's whole counter. Whether the platform
/// can meter at all is [`platform_support`]'s answer.
pub async fn sample_units() -> Option<Vec<UsageUnit>> {
    crate::apps::sys::sample_units().await
}

/// One cumulative reading for a unit of accounting. `key` identifies the unit
/// across samples so [`AppUsageTracker`] can diff it: a socket's address pair on
/// Linux and macOS, a process instance (PID plus generation) on Windows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsageUnit {
    pub key: String,
    pub name: String,
    pub rx: u64,
    pub tx: u64,
    /// Owning process id, when the source gives one. Only used to resolve the
    /// app icon; accounting stays keyed by `key`.
    pub pid: Option<u32>,
}

/// What a [`UsageUnit`]'s key identifies, and so what its counter means when it
/// doesn't simply grow. The sources disagree, so the same reading is banked
/// differently depending on where it came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CounterSemantics {
    /// Linux `ss` and macOS `nettop` socket rows: one key is one socket. A live
    /// socket's counter only grows, so a decrease means a new socket reused the
    /// address pair, and its whole reading is unbanked traffic. A socket that
    /// appears mid-session counts in full too: it opened since the last tick.
    /// Sockets in the first snapshot are the exception; see
    /// `CounterSemantics::primes_on_first_snapshot`.
    Socket,
    /// Windows ETW: one key is one process instance, and the counter is an
    /// accumulator Rove starts itself, so it's zero-based and only grows. A
    /// first sighting is all watched traffic and counts in full; a decrease
    /// can't happen, and credits nothing if it does.
    PidAccumulator,
}

impl CounterSemantics {
    /// What `now` adds to the running total, given the key's previous reading
    /// (`None` for a new key). Priming the first snapshot is the caller's job
    /// ([`Self::primes_on_first_snapshot`]), so `None` here means a unit that
    /// arrived while Rove was already watching.
    pub(crate) fn credit(self, now: u64, prev: Option<u64>) -> u64 {
        match (self, prev) {
            // Growth since the last reading is real traffic under both.
            (_, Some(p)) if now >= p => now - p,
            (Self::Socket, _) => now,
            (Self::PidAccumulator, None) => now,
            (Self::PidAccumulator, Some(_)) => 0,
        }
    }

    /// Whether a tracker's first snapshot is only a baseline, because its
    /// counters can include traffic from before Rove was watching.
    ///
    /// True for the OS socket sources: sockets open at launch carry whatever
    /// they moved beforehand. False for the Windows ETW accumulator, which Rove
    /// starts at zero, so its first sample is all watched traffic.
    pub(crate) const fn primes_on_first_snapshot(self) -> bool {
        match self {
            Self::Socket => true,
            Self::PidAccumulator => false,
        }
    }
}

impl Default for CounterSemantics {
    fn default() -> Self {
        crate::apps::sys::SEMANTICS
    }
}

/// Turns per-unit cumulative counters into per-app totals. `last` is the
/// previous reading per unit, to diff against; `totals` is bytes per app name.
/// All in memory, so totals cover only this run of Rove.
#[derive(Default)]
pub struct AppUsageTracker {
    last: HashMap<String, ByteCounts>,
    totals: HashMap<String, ByteCounts>,
    /// Epoch ms of the first snapshot; `None` until one arrives.
    tracking_since: Option<u64>,
    /// How to read the counters: the platform's, or any in tests.
    semantics: CounterSemantics,
    /// OS icon per app name, as a `data:` URI. Cached because the lookup is
    /// slow; misses are cached as `None` so daemons and CLIs aren't re-probed
    /// every tick.
    icons: HashMap<String, Option<String>>,
}

impl AppUsageTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// A tracker with the given semantics, so every platform's source can be
    /// tested on any host.
    #[cfg(test)]
    fn with_semantics(semantics: CounterSemantics) -> Self {
        Self { semantics, ..Self::default() }
    }

    /// Fold one successful snapshot into the totals, crediting each unit per
    /// [`CounterSemantics`]. Units missing from the snapshot are forgotten; their
    /// bytes are already in `totals`, and `last` stays bounded.
    ///
    /// For sources that need it (`CounterSemantics::primes_on_first_snapshot`)
    /// the first snapshot only sets baselines, since its counters include
    /// traffic from before Rove was watching.
    ///
    /// Only pass a snapshot that was actually taken; see [`sample_units`].
    pub fn ingest(&mut self, units: Vec<UsageUnit>) {
        let first_snapshot = self.tracking_since.is_none();
        if first_snapshot {
            self.tracking_since = Some(crate::utils::net::now_ms());
        }
        let priming = first_snapshot && self.semantics.primes_on_first_snapshot();

        let mut seen = HashSet::with_capacity(units.len());
        for unit in units {
            let prev = self.last.get(&unit.key).copied();
            let (rx_delta, tx_delta) = if priming {
                (0, 0)
            } else {
                (self.semantics.credit(unit.rx, prev.map(|p| p.rx)), self.semantics.credit(unit.tx, prev.map(|p| p.tx)))
            };

            self.last.insert(unit.key.clone(), ByteCounts { rx: unit.rx, tx: unit.tx });
            seen.insert(unit.key);

            // Once per name. Skipped under `cfg(test)` so the accounting tests
            // don't call into the OS icon APIs; `attaches_cached_icon_to_summary`
            // covers the attach path.
            if !self.icons.contains_key(&unit.name) {
                #[cfg(not(test))]
                let icon = crate::platform::app_icon::app_icon_data_uri(&unit.name, unit.pid);
                #[cfg(test)]
                let icon: Option<String> = None;
                self.icons.insert(unit.name.clone(), icon);
            }

            let entry = self.totals.entry(unit.name).or_default();
            entry.rx = entry.rx.saturating_add(rx_delta);
            entry.tx = entry.tx.saturating_add(tx_delta);
        }
        self.last.retain(|key, _| seen.contains(key));
    }

    /// Per-app totals, busiest first, dropping apps that have moved nothing.
    pub fn summary(&self) -> AppUsageSummary {
        let mut apps: Vec<AppUsage> = self
            .totals
            .iter()
            .filter(|(_, b)| b.rx > 0 || b.tx > 0)
            .map(|(name, b)| AppUsage {
                name: name.clone(),
                rx_bytes: b.rx,
                tx_bytes: b.tx,
                icon: self.icons.get(name).cloned().flatten(),
            })
            .collect();
        // Ties broken by name so the order is stable.
        apps.sort_by(|a, b| {
            (b.rx_bytes + b.tx_bytes).cmp(&(a.rx_bytes + a.tx_bytes)).then_with(|| a.name.cmp(&b.name))
        });

        AppUsageSummary { apps, support: platform_support(), tracking_since: self.tracking_since }
    }
}

#[cfg(test)]
mod tests {
    use super::macos::parse_nettop_sockets;
    use super::*;

    /// The same output, driven through the tracker across ticks: the wildcard
    /// sockets are inert, so a genuinely idle app banks nothing rather than
    /// re-banking its mDNS history every tick.
    #[test]
    fn wildcard_peer_sockets_do_not_accumulate_across_ticks() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        let out = "\
,bytes_in,bytes_out,
TIDAL.44881,301974419,0,
udp4 *:5353<->*:*,19623541,0,
udp4 *:5353<->*:*,51792185,0,";
        for _ in 0..5 {
            t.ingest(parse_nettop_sockets(out));
        }
        assert!(t.summary().apps.is_empty(), "phantom bytes from indistinguishable sockets");
    }

    /// PID 4821 runs `updater.exe`, moves 5 MB, and exits; Windows hands 4821 to
    /// a `powershell.exe` that moves 300 bytes. Keyed by the bare PID those are
    /// one key: the newcomer's zero-based counter reads as a *decrease* against
    /// the 5 MB baseline, so [`CounterSemantics::PidAccumulator`] credits it
    /// nothing (`(PidAccumulator, Some(_)) => 0`) and whatever it did move would
    /// be filed under the dead process's name. Keyed by instance they are two
    /// keys, each with its own baseline and its own label.
    #[test]
    fn recycled_pid_is_a_separate_instance() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::PidAccumulator);
        t.ingest(vec![UsageUnit {
            key: "4821#1".into(),
            name: "updater.exe".into(),
            rx: 5_000_000,
            tx: 0,
            pid: Some(4821),
        }]);
        // updater.exe exits: its key stops appearing, its bytes stay banked, and
        // the PID comes back around under a new generation.
        t.ingest(vec![UsageUnit {
            key: "4821#2".into(),
            name: "powershell.exe".into(),
            rx: 300,
            tx: 0,
            pid: Some(4821),
        }]);

        let s = t.summary();
        assert_eq!(s.apps.len(), 2, "both runs are reported, not merged into one");
        let updater = s.apps.iter().find(|a| a.name == "updater.exe").expect("updater banked");
        let shell = s.apps.iter().find(|a| a.name == "powershell.exe").expect("shell credited");
        assert_eq!(updater.rx_bytes, 5_000_000);
        assert_eq!(shell.rx_bytes, 300, "credited in full rather than swallowed as a decrease");
    }

    /// Every process Rove cannot name shares one row instead of scattering a
    /// `PID 4821` per corpse. They arrive as separate keys (separate instances,
    /// separate baselines) and land on one name, which is what the tracker banks
    /// by.
    #[test]
    fn unnamed_instances_collapse_into_one_row() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::PidAccumulator);
        t.ingest(vec![
            UsageUnit { key: "10#0".into(), name: "Short-lived processes".into(), rx: 100, tx: 0, pid: Some(10) },
            UsageUnit { key: "11#0".into(), name: "Short-lived processes".into(), rx: 250, tx: 0, pid: Some(11) },
        ]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        assert_eq!(s.apps[0].rx_bytes, 350);
    }

    #[test]
    fn accumulates_deltas_per_app_across_ticks() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        // Tick 1 is the first snapshot: this socket was already open, so its
        // reading is a baseline, not traffic.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 100, tx: 40, pid: None }]);
        // Tick 2: the same socket grew, so credit only the delta.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 250, tx: 90, pid: None }]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        assert_eq!(s.apps[0].name, "firefox");
        assert_eq!(s.apps[0].rx_bytes, 150);
        assert_eq!(s.apps[0].tx_bytes, 50);
    }

    /// A socket open when Rove launched carries its whole history. Crediting it
    /// on first sighting banks bytes we never watched.
    #[test]
    fn socket_source_primes_on_the_first_snapshot() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        // A long-lived socket, 40 MB into its life when Rove starts watching.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "Arc".into(), rx: 40_000_000, tx: 2_000_000, pid: None }]);
        assert!(t.summary().apps.is_empty(), "history from before the first snapshot was banked");

        // Only what it moves from there on counts.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "Arc".into(), rx: 40_000_300, tx: 2_000_100, pid: None }]);
        let s = t.summary();
        assert_eq!(s.apps[0].rx_bytes, 300);
        assert_eq!(s.apps[0].tx_bytes, 100);
    }

    /// Priming is scoped to the first *snapshot*, not to every first sighting: a
    /// socket that turns up later opened since the last tick, so its whole
    /// counter accrued while Rove was watching and still counts in full.
    #[test]
    fn socket_source_counts_a_mid_session_socket_in_full() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "Arc".into(), rx: 999, tx: 0, pid: None }]);
        t.ingest(vec![
            UsageUnit { key: "s1".into(), name: "Arc".into(), rx: 999, tx: 0, pid: None },
            UsageUnit { key: "s2".into(), name: "Arc".into(), rx: 700, tx: 0, pid: None },
        ]);
        assert_eq!(t.summary().apps[0].rx_bytes, 700);
    }

    #[test]
    fn socket_source_banks_closed_sockets_and_counts_reused_keys_fresh() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        // Baseline snapshot, then s1 moves 500 while we watch.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 0, tx: 0, pid: None }]);
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 500, tx: 0, pid: None }]);
        // s1 closed (absent this tick); its 500 stays banked. A new socket s2
        // for the same app opens with its own cumulative counter.
        t.ingest(vec![UsageUnit { key: "s2".into(), name: "firefox".into(), rx: 200, tx: 0, pid: None }]);
        // s1's address pair is reused by a new socket with a low counter: its
        // full reading counts, not an underflow.
        t.ingest(vec![
            UsageUnit { key: "s2".into(), name: "firefox".into(), rx: 200, tx: 0, pid: None },
            UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 30, tx: 0, pid: None },
        ]);
        let s = t.summary();
        assert_eq!(s.apps[0].rx_bytes, 500 + 200 + 30);
    }

    /// The appstored regression, and why this reads sockets rather than
    /// `nettop -P`: a downloader's connections finish and are replaced while
    /// others are still pulling. Summed per process the tick nets out downwards
    /// (20 MB to 17 MB), so an aggregate reader banks nothing; 7 MB really
    /// moved.
    #[test]
    fn socket_source_counts_traffic_when_a_sibling_socket_closes() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        let sock = |k: &str, rx: u64| UsageUnit {
            key: format!("appstored.42|{k}"),
            name: "appstored".into(),
            rx,
            tx: 0,
            pid: Some(42),
        };
        // First snapshot: two connections already open, 10 MB each. Baseline.
        t.ingest(vec![sock("a", 10_000_000), sock("b", 10_000_000)]);
        // "a" finishes and closes. In the same tick "b" pulls 4 MB more and a
        // fresh "c" pulls 3 MB.
        t.ingest(vec![sock("b", 14_000_000), sock("c", 3_000_000)]);
        assert_eq!(t.summary().apps[0].rx_bytes, 7_000_000);
    }

    /// A socket that closes is gone for good; its address pair coming back is a
    /// brand-new socket with a fresh counter, not the old one rewound. The banked
    /// history must survive the round trip either way.
    #[test]
    fn socket_source_does_not_rebank_history_when_a_key_is_recycled() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        let tick = |rx: u64| {
            vec![UsageUnit { key: "cupsd.99|tcp4 a<->b".into(), name: "cupsd".into(), rx, tx: 0, pid: Some(99) }]
        };
        t.ingest(tick(5_000_000)); // first snapshot: baseline
        t.ingest(tick(5_000_400)); // +400 watched
        t.ingest(vec![]); // socket closed: absent from the sample
                          // The address pair is recycled by a new socket, counting from scratch.
        t.ingest(tick(600));
        assert_eq!(t.summary().apps[0].rx_bytes, 1000);
    }

    /// Windows' ETW accumulator is zero-based, so unlike an `ss` or `nettop`
    /// socket a first sighting is all watched traffic and must not be primed
    /// away.

    #[test]
    fn pid_accumulator_source_counts_a_first_sighting_in_full() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::PidAccumulator);
        t.ingest(vec![UsageUnit { key: "1234".into(), name: "chrome".into(), rx: 800, tx: 100, pid: Some(1234) }]);
        t.ingest(vec![UsageUnit { key: "1234".into(), name: "chrome".into(), rx: 900, tx: 100, pid: Some(1234) }]);
        let s = t.summary();
        assert_eq!(s.apps[0].rx_bytes, 900);
        assert_eq!(s.apps[0].tx_bytes, 100);
    }

    #[test]
    fn sums_multiple_processes_sharing_a_name() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        // Baseline snapshot, then both sockets move while we watch.
        t.ingest(vec![
            UsageUnit { key: "a".into(), name: "chrome".into(), rx: 0, tx: 0, pid: None },
            UsageUnit { key: "b".into(), name: "chrome".into(), rx: 0, tx: 0, pid: None },
        ]);
        t.ingest(vec![
            UsageUnit { key: "a".into(), name: "chrome".into(), rx: 100, tx: 10, pid: None },
            UsageUnit { key: "b".into(), name: "chrome".into(), rx: 300, tx: 20, pid: None },
        ]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        assert_eq!(s.apps[0].rx_bytes, 400);
        assert_eq!(s.apps[0].tx_bytes, 30);
    }

    #[test]
    fn attaches_cached_icon_to_summary() {
        // Live icon resolution is skipped under cfg(test), so seed the cache
        // directly (same-module tests can touch private fields) to prove the
        // summary carries a resolved icon and leaves an unresolved one as None.
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        t.ingest(vec![
            UsageUnit { key: "a".into(), name: "Spotify".into(), rx: 0, tx: 0, pid: None },
            UsageUnit { key: "b".into(), name: "daemon".into(), rx: 0, tx: 0, pid: None },
        ]);
        t.ingest(vec![
            UsageUnit { key: "a".into(), name: "Spotify".into(), rx: 100, tx: 0, pid: None },
            UsageUnit { key: "b".into(), name: "daemon".into(), rx: 50, tx: 0, pid: None },
        ]);
        t.icons.insert("Spotify".into(), Some("data:image/png;base64,ABC".into()));
        // "daemon" stays cached as None (ingest inserted None under cfg(test)).

        let s = t.summary();
        let spotify = s.apps.iter().find(|a| a.name == "Spotify").unwrap();
        let daemon = s.apps.iter().find(|a| a.name == "daemon").unwrap();
        assert_eq!(spotify.icon.as_deref(), Some("data:image/png;base64,ABC"));
        assert_eq!(daemon.icon, None);
    }
}
