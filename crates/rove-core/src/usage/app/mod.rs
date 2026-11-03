//! Per-app network usage: how many bytes each app has moved.
//!
//! [`crate::usage::data`] meters the interface as a whole. This attributes
//! bytes to the process that moved them, without packet capture (no
//! libpcap/Npcap):
//!
//!   * **Linux**: `ss -tinHp` reads each socket's `TCP_INFO`
//!     (`bytes_sent`/`bytes_received`) with its owning process. Unprivileged for
//!     your own sockets; no eBPF.
//!   * **macOS**: `nettop` lists each process's sockets beneath it with
//!     cumulative bytes, TCP and UDP alike. Sockets whose peer isn't a host on
//!     the network (unconnected mDNS, loopback) are dropped by
//!     `util::net::routable_peer_ip`.
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

#[cfg(windows)]
mod etw;

use crate::usage::ByteCounts;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// One app's network usage since Rove started watching, summed over every
/// process with that name. Traffic to a loopback or wildcard peer is excluded,
/// the rule the Hosts view uses (`util::net::routable_peer_ip`). The same
/// traffic by remote host is [`AppHosts`](crate::usage::host::AppHosts).
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
    /// See [`platform_support`]. When `"unsupported"` the UI explains why
    /// instead of showing an empty list.
    pub support: &'static str,
    /// Epoch ms of the first sample, or null before then.
    pub tracking_since: Option<u64>,
}

/// `"supported"` on Linux and macOS, and on Windows while the ETW session is up
/// (it needs admin, so a runtime check there); `"unsupported"` otherwise.
pub fn platform_support() -> &'static str {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        "supported"
    }
    #[cfg(windows)]
    {
        if etw::is_active() {
            "supported"
        } else {
            "unsupported"
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        "unsupported"
    }
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

/// The semantics of this platform's source (see [`sample_units`]).
const fn platform_semantics() -> CounterSemantics {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        CounterSemantics::Socket
    }
    #[cfg(windows)]
    {
        CounterSemantics::PidAccumulator
    }
    // Nothing is ever sampled here, so the choice doesn't matter.
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        CounterSemantics::Socket
    }
}

impl Default for CounterSemantics {
    fn default() -> Self {
        platform_semantics()
    }
}

/// One snapshot of per-unit cumulative byte counters.
///
/// `None` means no sample was taken (tool missing, failed, timed out, or an
/// unsupported platform); `Some(vec![])` means nothing to report. Keep them
/// apart: ingesting a failure as empty would drop every baseline, and the next
/// good tick would re-credit each unit's whole counter. Whether the platform
/// can meter at all is [`platform_support`]'s answer.
pub async fn sample_units() -> Option<Vec<UsageUnit>> {
    // -t TCP only (UDP sockets have no byte counters in sock_diag), -i socket
    // info (the bytes), -n numeric, -H no header, -p process.
    #[cfg(target_os = "linux")]
    {
        return crate::util::shell::try_run("ss -tinHp").await.map(|out| parse_ss(&out));
    }
    // No -P: its per-process row can't be accumulated (see the module docs).
    // No -m, so UDP is listed too. -L 1 one sample, -x raw bytes, -n no DNS,
    // -J only our columns.
    #[cfg(target_os = "macos")]
    {
        return crate::util::shell::try_run("nettop -L 1 -x -n -J bytes_in,bytes_out")
            .await
            .map(|out| parse_nettop_sockets(&out));
    }
    // An in-process read of the ETW accumulator: synchronous, and it can't fail.
    #[cfg(windows)]
    {
        return Some(etw::sample_units());
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        None
    }
}

/// The number after `key` in a line, e.g. `5231` from `bytes_sent:5231`.
#[cfg(any(target_os = "linux", test))]
pub(crate) fn field_u64(line: &str, key: &str) -> Option<u64> {
    let start = line.find(key)? + key.len();
    let digits: String = line[start..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// The first process name from an `ss -p` process column, i.e. the `NAME` in
/// `users:(("NAME",pid=123,fd=45))`.
#[cfg(any(target_os = "linux", test))]
pub(crate) fn ss_proc_name(line: &str) -> Option<String> {
    let marker = "users:((\"";
    let start = line.find(marker)? + marker.len();
    let end = line[start..].find('"')?;
    Some(line[start..start + end].to_string())
}

/// The pid that goes with [`ss_proc_name`], i.e. the `123` in
/// `users:(("NAME",pid=123,fd=45))`.
#[cfg(any(target_os = "linux", test))]
pub(crate) fn ss_proc_pid(line: &str) -> Option<u32> {
    let marker = ",pid=";
    let start = line.find(marker)? + marker.len();
    let digits = line[start..].bytes().take_while(u8::is_ascii_digit).count();
    line[start..start + digits].parse().ok()
}

/// Parse `ss -tinHp` into per-socket readings. Each socket is a header line
/// (`STATE recvq sendq LOCAL PEER users:((...))`) then an indented info line
/// with `bytes_sent:`/`bytes_received:`. Sockets with no process (TIME-WAIT),
/// no counters, or no routable peer ([`crate::util::net::routable_peer_ip`])
/// are skipped. Loopback matters most: the kernel lists both ends of a
/// `127.0.0.1` connection as sockets, so an app talking to itself would be
/// billed twice.
#[cfg(any(target_os = "linux", test))]
fn parse_ss(output: &str) -> Vec<UsageUnit> {
    let mut units = Vec::new();
    // (name, socket key, pid) of the header awaiting its info line.
    let mut pending: Option<(String, String, Option<u32>)> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // The info line: `bytes_sent` is tx, `bytes_received` is rx.
        if trimmed.contains("bytes_sent:") || trimmed.contains("bytes_received:") {
            if let Some((name, key, pid)) = pending.take() {
                let tx = field_u64(trimmed, "bytes_sent:").unwrap_or(0);
                let rx = field_u64(trimmed, "bytes_received:").unwrap_or(0);
                units.push(UsageUnit { key, name, rx, tx, pid });
            }
            continue;
        }

        // A header line. A socket with no process resets the pairing so the
        // next info line isn't credited to a stale header.
        match ss_proc_name(trimmed) {
            Some(name) => {
                // Columns: STATE Recv-Q Send-Q Local Peer [Process].
                let mut cols = trimmed.split_whitespace();
                let local = cols.nth(3);
                let peer = cols.next();
                // A non-routable peer (loopback, listener) drops the pairing so
                // its info line isn't banked.
                pending = match (local, peer, peer.and_then(crate::util::net::routable_peer_ip)) {
                    (Some(local), Some(peer), Some(_)) => Some((name, format!("{local}|{peer}"), ss_proc_pid(trimmed))),
                    _ => None,
                };
            }
            None => pending = None,
        }
    }
    units
}

/// Parse `nettop -L 1 -x -n -J bytes_in,bytes_out` into per-socket readings. A
/// process row (`name.pid`) is followed by its socket rows (`tcp4
/// local<->peer`, `udp4 …`), each with cumulative counters. The process row is
/// only read as the owner, never banked: it's the sum of the rows under it, a
/// gauge over open sockets (see the module docs).
///
/// Listeners (empty byte columns) and sockets with a wildcard or loopback peer
/// are skipped, via [`crate::util::net::routable_peer_ip`], the same rule
/// [`crate::usage::host`] applies to the same sockets.
#[cfg(any(target_os = "macos", test))]
fn parse_nettop_sockets(output: &str) -> Vec<UsageUnit> {
    let mut units: Vec<UsageUnit> = Vec::new();
    // (`name.pid`, name, pid) of the process whose rows we're reading.
    let mut current: Option<(String, String, Option<u32>)> = None;

    for line in output.lines() {
        // Split on ',' alone, keeping empty fields: a socket label contains
        // spaces, so splitting on whitespace would shift the byte columns.
        let mut fields = line.split(',');
        let Some(label) = fields.next().map(str::trim) else { continue };
        if label.is_empty() {
            continue;
        }

        if let Some((_, peer)) = label.split_once("<->") {
            let Some((owner, name, pid)) = &current else { continue };
            if crate::util::net::routable_peer_ip(peer).is_none() {
                continue;
            }
            let rx = fields.next().and_then(|f| f.trim().parse::<u64>().ok());
            let tx = fields.next().and_then(|f| f.trim().parse::<u64>().ok());
            let (Some(rx), Some(tx)) = (rx, tx) else { continue };
            units.push(UsageUnit {
                // Scope the socket to its owner: two processes can each hold a
                // socket printing the same label.
                key: format!("{owner}|{label}"),
                name: name.clone(),
                rx,
                tx,
                pid: *pid,
            });
            continue;
        }

        // A process row is "name.pid" with a numeric pid. Anything else (the
        // header) clears the owner so stray rows aren't misattributed.
        match label.rsplit_once('.') {
            Some((name, pid)) if !name.is_empty() && !pid.is_empty() && pid.bytes().all(|b| b.is_ascii_digit()) => {
                current = Some((label.to_string(), name.to_string(), pid.parse().ok()));
            }
            _ => current = None,
        }
    }

    // Defensive: a concrete peer makes each 4-tuple unique, so this shouldn't
    // fire. Rows sharing a key re-bank each other's whole counters every tick
    // (wildcard rows once read a music player at 1.4 GB in twelve seconds), so
    // dropping them under-counts, but boundedly.
    let mut seen: HashMap<String, usize> = HashMap::with_capacity(units.len());
    for unit in &units {
        *seen.entry(unit.key.clone()).or_default() += 1;
    }
    units.retain(|unit| seen.get(&unit.key) == Some(&1));
    units
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
            self.tracking_since = Some(crate::util::net::now_ms());
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

/// One per-connection reading from the Windows ETW session, for the Hosts view.
/// Shaped like `usage::host::PeerReading` so it maps straight across without
/// this module depending on that type.
#[cfg(windows)]
pub(crate) struct PeerUnit {
    pub conn_key: String,
    pub name: String,
    pub pid: u32,
    pub ip: String,
    pub port: Option<u16>,
    pub rx: u64,
    pub tx: u64,
}

/// The per-connection ETW snapshot for the Hosts view; see
/// [`etw::sample_peer_units`].
#[cfg(windows)]
pub(crate) fn windows_peer_units() -> Vec<PeerUnit> {
    etw::sample_peer_units()
}

/// Why per-app usage (and, on the same session, Hosts and Traffic) is
/// unavailable, for the UI's unsupported state: the last ETW start error on
/// Windows; `None` once it's running, and on every other platform.
pub fn support_detail() -> Option<String> {
    #[cfg(windows)]
    {
        etw::last_error()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ss_socket_rows() {
        // Two ESTAB sockets (firefox, spotify) plus a process-less TIME-WAIT
        // that must be ignored. Info lines are indented, as `ss -i` prints them.
        let out = "\
ESTAB 0 0 192.168.1.42:52134 140.82.113.25:443 users:((\"firefox\",pid=1234,fd=90))
\t cubic wscale:8,7 rto:212 rtt:11.5/5.75 mss:1418 cwnd:10 bytes_sent:5231 bytes_acked:5231 bytes_received:18422 segs_out:20 segs_in:22 send 9.8Mbps
ESTAB 0 0 192.168.1.42:40122 35.186.224.25:443 users:((\"spotify\",pid=567,fd=44))
\t cubic wscale:7,7 rto:204 bytes_sent:1200 bytes_received:900 segs_out:8 segs_in:9
TIME-WAIT 0 0 192.168.1.42:40120 35.186.224.25:443
\t cubic bytes_sent:99 bytes_received:99";
        let units = parse_ss(out);
        assert_eq!(units.len(), 2);
        assert_eq!(
            units[0],
            UsageUnit {
                key: "192.168.1.42:52134|140.82.113.25:443".into(),
                name: "firefox".into(),
                rx: 18422,
                tx: 5231,
                pid: Some(1234),
            }
        );
        assert_eq!(units[1].name, "spotify");
        assert_eq!(units[1].pid, Some(567));
        assert_eq!(units[1].rx, 900);
        assert_eq!(units[1].tx, 1200);
    }

    /// A loopback socket is dropped: on Linux the kernel lists both of its ends
    /// as separate sockets, so counting it bills an app talking to itself twice.
    #[test]
    fn ss_loopback_sockets_are_not_metered() {
        let out = "\
ESTAB 0 0 127.0.0.1:9000 127.0.0.1:53 users:((\"resolver\",pid=42,fd=7))
\t cubic bytes_sent:4000 bytes_received:4000 segs_out:3 segs_in:3
ESTAB 0 0 192.168.1.42:52134 140.82.113.25:443 users:((\"firefox\",pid=1234,fd=90))
\t cubic bytes_sent:100 bytes_received:200 segs_out:2 segs_in:2";
        let units = parse_ss(out);
        assert_eq!(units.len(), 1, "the loopback socket is dropped, the real one kept");
        assert_eq!(units[0].name, "firefox");
        assert_eq!(units[0].rx, 200);
    }

    #[test]
    fn parses_nettop_socket_rows_and_ignores_the_process_row() {
        // Real `nettop -L 1 -x -n -J bytes_in,bytes_out` shape: a header, then
        // each process followed by its sockets. The process row is exactly the
        // sum of its sockets, so banking it too would double-count. Listeners
        // print empty byte columns.
        let out = "\
,bytes_in,bytes_out,
launchd.1,0,0,
tcp4 127.0.0.1:8021<->*:*,,,
apsd.375,87292,449441,
tcp4 192.168.2.16:61151<->17.57.144.246:5223,87292,449441,
syslogd.368,0,422,
udp4 192.168.2.16:54845<->192.168.2.1:514,0,422,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 2, "one unit per socket carrying counters, none per process");
        assert_eq!(
            units[0],
            UsageUnit {
                key: "apsd.375|tcp4 192.168.2.16:61151<->17.57.144.246:5223".into(),
                name: "apsd".into(),
                rx: 87292,
                tx: 449441,
                pid: Some(375),
            }
        );
        // A connected UDP socket is metered exactly like TCP.
        assert_eq!(units[1].name, "syslogd");
        assert_eq!(units[1].tx, 422);
    }

    #[test]
    fn nettop_socket_rows_without_an_owning_process_are_dropped() {
        // The header row clears the owner, so a stray socket row can't be
        // misattributed to whichever process happened to be parsed last.
        let out = "\
,bytes_in,bytes_out,
tcp4 10.0.0.1:1<->10.0.0.2:2,500,500,";
        assert!(parse_nettop_sockets(out).is_empty());
    }

    /// Two processes can each hold a socket printing the same label, so the key
    /// has to be scoped to the owner or they'd collide into one unit.
    #[test]
    fn nettop_socket_keys_are_scoped_to_their_process() {
        let out = "\
,bytes_in,bytes_out,
firefox.1,10,0,
tcp4 10.0.0.1:1<->10.0.0.9:443,10,0,
Spotify.2,20,0,
tcp4 10.0.0.1:1<->10.0.0.9:443,20,0,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 2);
        assert_ne!(units[0].key, units[1].key);
    }

    /// The TIDAL regression: real nettop output where one process holds several
    /// unconnected sockets printing the identical label with different counters.
    /// Keyed together they telescope (each tick credits the largest counter
    /// afresh), which read a music player at 1.4 GB in twelve seconds. They must
    /// not be metered at all.
    #[test]
    fn nettop_wildcard_peer_sockets_are_not_metered() {
        let out = "\
,bytes_in,bytes_out,
TIDAL.44881,301974419,328,
udp4 *:5353<->*:*,19623541,40,
udp4 *:5353<->*:*,23292855,40,
udp4 *:5353<->*:*,51792185,40,
tcp4 192.168.2.16:5:1<->17.248.1.1:443,4096,128,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 1, "only the socket with a concrete peer is meterable");
        assert_eq!(units[0].rx, 4096);
    }

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

    /// Loopback is excluded on macOS just as on Linux and in the hosts view: a
    /// process talking to `127.0.0.1` isn't using the network. (The peer-rule
    /// unit tests live with the rule, in `util::net`; this pins that the parser
    /// actually applies it.)
    #[test]
    fn nettop_loopback_sockets_are_not_metered() {
        let out = "\
,bytes_in,bytes_out,
localproxy.7,5000,5000,
tcp4 127.0.0.1:9000<->127.0.0.1:53,4000,4000,
tcp4 192.168.2.16:51000<->17.248.1.1:443,1000,1000,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 1, "the loopback socket is dropped, the real one kept");
        assert_eq!(units[0].rx, 1000);
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
