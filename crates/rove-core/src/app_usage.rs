//! Per-application network usage — "how many MB has each app used".
//!
//! Rove's existing [`crate::data_usage`] meters the *interface* (kernel byte
//! counters, one global number). This module attributes bytes to the *process*
//! that moved them, without a packet-capture pipeline (so no libpcap/Npcap and
//! no elevated privileges for the user's own apps):
//!
//!   * **Linux** — `ss -tinHp` reads the kernel's per-socket `TCP_INFO`
//!     (`bytes_sent`/`bytes_received`) alongside the owning process. Readable
//!     unprivileged for your own sockets; no eBPF, no capture.
//!   * **macOS** — `nettop` reports cumulative bytes per process.
//!   * **Windows / other** — per-process byte metering needs an ETW consumer
//!     (`Microsoft-Windows-Kernel-Network`), not yet implemented, so the
//!     platform reports itself unsupported rather than returning wrong numbers.
//!
//! Both supported sources report *cumulative* counters per unit of accounting —
//! a single socket on Linux, a process on macOS — so, exactly like the
//! interface tracker, [`AppUsageTracker`] keeps the last reading and banks the
//! delta into a per-app running total. Accounting at the socket level (Linux)
//! means a socket that both opens and closes *between* two samples is missed —
//! the same inherent limitation snapshot-based tools like Sniffnet document —
//! but every socket that lives across a tick is counted in full.

use crate::types::{AppUsage, AppUsageSummary};
use std::collections::{HashMap, HashSet};

/// `"supported"` on platforms with a byte-accurate per-process source,
/// `"unsupported"` elsewhere. Mirrors the `&'static str` status convention used
/// by `LanDeviceScan::dhcp_status`. On Windows this depends on the ETW session
/// actually being up (it needs admin), so it is a runtime check, not a constant.
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

/// One cumulative reading for a single unit of accounting. `key` is a stable
/// identity for that unit across samples — a socket's address pair on Linux, a
/// `name.pid` on macOS — so [`AppUsageTracker`] can diff it tick to tick.
/// `rx`/`tx` are cumulative bytes in/out for that unit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UsageUnit {
    pub key: String,
    pub name: String,
    pub rx: u64,
    pub tx: u64,
    /// The owning process id, when the source reports one (macOS `nettop`,
    /// Windows ETW). Used to resolve the app's real OS icon; `None` on Linux
    /// (keyed by socket, no icon lookup) and doesn't affect byte accounting.
    pub pid: Option<u32>,
}

/// What a [`UsageUnit`]'s key identifies, and so what its counter means when it
/// *doesn't* simply grow. The three sources Rove reads disagree on this, and the
/// disagreement is the whole reason this type exists: the same reading has to be
/// banked differently depending on where it came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CounterSemantics {
    /// Linux `ss`: one key is one socket (its local/peer address pair). A live
    /// socket's counter only ever grows, so a decrease means the address pair was
    /// recycled by a brand-new socket carrying its own fresh counter — all of
    /// that reading is traffic we haven't banked. A socket that turns up
    /// mid-session counts in full for the same reason: it opened since the last
    /// tick, so its whole counter accrued while we were watching. The sockets
    /// already established in the *first* snapshot are the exception — see
    /// [`CounterSemantics::primes_on_first_snapshot`].
    Socket,
    /// macOS `nettop -P`: one key is one process, and its counter is the sum over
    /// that process's *currently open* sockets. Such a sum legitimately falls when
    /// a socket closes and drops out of it, so a decrease is bookkeeping rather
    /// than traffic and must credit nothing. A first sighting credits nothing
    /// either: the process arrives carrying however much it moved before Rove was
    /// watching, and this tracker only claims to count what it saw.
    ProcessAggregate,
    /// Windows ETW: one key is one PID, and the counter is an accumulator Rove
    /// starts itself, so it's zero-based at our first sample and only grows. A
    /// first sighting is therefore all traffic we watched and counts in full; a
    /// decrease can't happen, and credits nothing if it somehow does.
    PidAccumulator,
}

impl CounterSemantics {
    /// What `now` adds to the running total, given the previous reading for the
    /// same key (`None` when the key is new to us). The first snapshot a tracker
    /// ever ingests is the caller's business — see [`Self::primes_on_first_snapshot`]
    /// — so a `None` here means a unit that arrived while Rove was already
    /// watching, not one that was already there when it started.
    pub(crate) fn credit(self, now: u64, prev: Option<u64>) -> u64 {
        match (self, prev) {
            // Growth since the last reading is real traffic under all three.
            (_, Some(p)) if now >= p => now - p,
            (Self::Socket, _) => now,
            (Self::PidAccumulator, None) => now,
            (Self::PidAccumulator, Some(_)) => 0,
            (Self::ProcessAggregate, _) => 0,
        }
    }

    /// Whether the first snapshot a tracker ever ingests is pure baseline — i.e.
    /// whether the counters it carries can include traffic from before Rove was
    /// watching.
    ///
    /// True for both OS-supplied sources: the sockets and processes already alive
    /// at launch arrive holding however much they moved beforehand, and these
    /// trackers only claim to count what they saw. False for Windows' ETW
    /// accumulator, which Rove starts itself and so reads zero-based — its first
    /// sample is entirely traffic we watched, and priming it away would lose it.
    pub(crate) const fn primes_on_first_snapshot(self) -> bool {
        match self {
            Self::Socket | Self::ProcessAggregate => true,
            Self::PidAccumulator => false,
        }
    }
}

/// The semantics of this platform's source (see [`sample_units`]).
const fn platform_semantics() -> CounterSemantics {
    #[cfg(target_os = "linux")]
    {
        CounterSemantics::Socket
    }
    #[cfg(target_os = "macos")]
    {
        CounterSemantics::ProcessAggregate
    }
    #[cfg(windows)]
    {
        CounterSemantics::PidAccumulator
    }
    // Nothing is ever sampled here, so the choice is inert; match Linux.
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

/// Take one snapshot of per-unit cumulative byte counters from the OS.
///
/// `None` means no sample was taken — the source tool is missing, errored, timed
/// out, or the platform is unsupported. `Some(vec![])` means the sample worked
/// and there was genuinely nothing to report (an idle machine with no open
/// sockets). Callers must keep the two apart: a failed sample says nothing about
/// which units still exist, and feeding it to [`AppUsageTracker::ingest`] as if
/// every unit had vanished would drop every baseline, so the next good tick
/// would re-credit each unit's whole counter as fresh traffic. The platform's
/// *capability* is reported separately by [`platform_support`], so an idle
/// machine still reads as "supported, nothing yet".
pub async fn sample_units() -> Option<Vec<UsageUnit>> {
    // -t TCP only (UDP has no byte counters in the diag interface), -i socket
    // info (the bytes), -n numeric, -H no header, -p process.
    #[cfg(target_os = "linux")]
    {
        return crate::shell::try_run("ss -tinHp").await.map(|out| parse_ss(&out));
    }
    // -P per-process (no per-connection sub-rows), -L 1 one sample then exit, -x
    // raw byte counts (not human units), -n no DNS, -J restricts to our columns.
    #[cfg(target_os = "macos")]
    {
        return crate::shell::try_run("nettop -P -L 1 -x -n -J bytes_in,bytes_out")
            .await
            .map(|out| parse_nettop(&out));
    }
    // Windows reads a running ETW accumulator rather than shelling out; this is
    // a synchronous snapshot that can't fail, so there's nothing to await.
    #[cfg(windows)]
    {
        return Some(etw::sample_units());
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        None
    }
}

/// Read an unsigned field written as `key<digits>` out of a whitespace-joined
/// line — e.g. `bytes_sent:5231` → `5231`.
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

/// Parse `ss -tinHp` output into per-socket cumulative readings. Each socket is
/// two lines: a header (`STATE recvq sendq LOCAL PEER users:((...))`) carrying
/// the addresses and owning process, then an indented info line carrying
/// `bytes_sent:`/`bytes_received:`. Sockets without a process (TIME-WAIT, etc.)
/// or without byte counters are skipped.
#[cfg(any(target_os = "linux", test))]
fn parse_ss(output: &str) -> Vec<UsageUnit> {
    let mut units = Vec::new();
    // The header we're waiting to pair with its following info line.
    let mut pending: Option<(String, String)> = None; // (name, socket key)

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Info/continuation line: the byte counters live here. `bytes_sent` is
        // what this host transmitted (tx); `bytes_received` what it took in (rx).
        if trimmed.contains("bytes_sent:") || trimmed.contains("bytes_received:") {
            if let Some((name, key)) = pending.take() {
                let tx = field_u64(trimmed, "bytes_sent:").unwrap_or(0);
                let rx = field_u64(trimmed, "bytes_received:").unwrap_or(0);
                units.push(UsageUnit { key, name, rx, tx, pid: None });
            }
            continue;
        }

        // Otherwise a header line. Pair it with a process, or drop any stale
        // pending header (a process-less socket resets the pairing).
        match ss_proc_name(trimmed) {
            Some(name) => {
                // Columns: STATE Recv-Q Send-Q Local Peer [Process]. The
                // local+peer pair is a stable per-socket key across samples.
                let mut cols = trimmed.split_whitespace();
                let local = cols.nth(3);
                let peer = cols.next();
                // Socket-keyed accounting: no per-process icon lookup on Linux,
                // so pid is left unset.
                pending = match (local, peer) {
                    (Some(local), Some(peer)) => Some((name, format!("{local}|{peer}"))),
                    _ => None,
                };
            }
            None => pending = None,
        }
    }
    units
}

/// Parse `nettop -P -x -J bytes_in,bytes_out` output. Each process row leads
/// with `name.pid` followed by its two cumulative byte columns. Deliberately
/// tolerant of whitespace- or comma-separated output (nettop's formatting
/// varies): a row is any line whose first token ends in `.<digits>` and which
/// has at least two integer columns after it. `bytes_in` is rx, `bytes_out` tx.
#[cfg(any(target_os = "macos", test))]
fn parse_nettop(output: &str) -> Vec<UsageUnit> {
    let mut units = Vec::new();
    for line in output.lines() {
        let fields: Vec<&str> =
            line.split([',', ' ', '\t']).filter(|f| !f.is_empty()).collect();
        let Some(first) = fields.first() else { continue };

        // A process row's first token is "name.pid" with a numeric pid; the
        // header row ("bytes_in") and per-interface sub-rows fail this.
        let Some((name, pid)) = first.rsplit_once('.') else { continue };
        if name.is_empty() || pid.is_empty() || !pid.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }

        let nums: Vec<u64> = fields[1..].iter().filter_map(|f| f.parse::<u64>().ok()).collect();
        let (Some(&rx), Some(&tx)) = (nums.first(), nums.get(1)) else { continue };
        units.push(UsageUnit {
            key: (*first).to_string(),
            name: name.to_string(),
            rx,
            tx,
            pid: pid.parse::<u32>().ok(),
        });
    }
    units
}

#[derive(Default, Clone, Copy)]
struct ByteCounts {
    rx: u64,
    tx: u64,
}

/// Turns per-unit cumulative counters into per-app running totals for the
/// session. `last` holds the previous reading per unit (to diff); `totals` is
/// the banked bytes per app name. The only durable-feeling state is in memory —
/// totals reset when the app restarts, like the "since boot" idea but scoped to
/// how long Rove has been watching.
#[derive(Default)]
pub struct AppUsageTracker {
    last: HashMap<String, ByteCounts>,
    totals: HashMap<String, ByteCounts>,
    since: Option<u64>,
    /// How to read the counters this tracker is fed — set from the platform's
    /// source and overridable in tests.
    semantics: CounterSemantics,
    /// Resolved real OS icon per app name, as a `data:` URI. Cached because the
    /// lookup shells into AppKit/Launch Services — do it once per name, not every
    /// tick. `None` is cached too (name isn't an installed app), so unresolved
    /// daemons/CLIs aren't re-probed forever; the UI shows a monogram for them.
    icons: HashMap<String, Option<String>>,
}

impl AppUsageTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// A tracker that reads its counters with the given semantics, for testing
    /// every platform's source on whatever host the tests run on.
    #[cfg(test)]
    fn with_semantics(semantics: CounterSemantics) -> Self {
        Self { semantics, ..Self::default() }
    }

    /// Fold one successful snapshot into the running totals, crediting each unit
    /// per [`CounterSemantics`]. Units absent from this snapshot are forgotten —
    /// their bytes are already banked in `totals`, so `last` never grows without
    /// bound across a long session.
    ///
    /// The first snapshot ever ingested only sets baselines, for the sources that
    /// need it ([`CounterSemantics::primes_on_first_snapshot`]): whatever its
    /// units have already moved, they moved before Rove was watching, and this
    /// tracker only claims to count what it saw.
    ///
    /// Only ever pass a snapshot that was actually taken: [`sample_units`]
    /// returns `None` for a failed sample, and folding that in as an empty
    /// snapshot would forget every baseline and re-credit the world on the next
    /// good tick.
    pub fn ingest(&mut self, units: Vec<UsageUnit>) {
        let first_snapshot = self.since.is_none();
        if first_snapshot {
            self.since = Some(crate::net_util::now_ms());
        }
        let priming = first_snapshot && self.semantics.primes_on_first_snapshot();

        let mut seen = HashSet::with_capacity(units.len());
        for unit in units {
            let prev = self.last.get(&unit.key).copied();
            let (drx, dtx) = if priming {
                (0, 0)
            } else {
                (
                    self.semantics.credit(unit.rx, prev.map(|p| p.rx)),
                    self.semantics.credit(unit.tx, prev.map(|p| p.tx)),
                )
            };

            self.last.insert(unit.key.clone(), ByteCounts { rx: unit.rx, tx: unit.tx });
            seen.insert(unit.key);

            // First time we see this app name, resolve its real OS icon (once).
            // Skipped under `cfg(test)` so the pure accounting tests don't shell
            // into AppKit/Launch Services (see `attaches_cached_icon_to_summary`
            // for the attach path).
            if !self.icons.contains_key(&unit.name) {
                #[cfg(not(test))]
                let icon = crate::platform::app_icon::app_icon_data_uri(&unit.name, unit.pid);
                #[cfg(test)]
                let icon: Option<String> = None;
                self.icons.insert(unit.name.clone(), icon);
            }

            let entry = self.totals.entry(unit.name).or_default();
            entry.rx = entry.rx.saturating_add(drx);
            entry.tx = entry.tx.saturating_add(dtx);
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
        // Busiest (rx+tx) first; ties broken by name so the order is stable.
        apps.sort_by(|a, b| {
            (b.rx_bytes + b.tx_bytes)
                .cmp(&(a.rx_bytes + a.tx_bytes))
                .then_with(|| a.name.cmp(&b.name))
        });

        AppUsageSummary { apps, support: platform_support(), tracking_since: self.since }
    }
}

/// Windows per-app metering via the Microsoft-Windows-Kernel-Network ETW
/// provider. The provider emits one event per network send/receive carrying the
/// owning `PID` and the byte `size`; a single long-lived consumer thread
/// accumulates those into cumulative per-PID totals, which [`sample_units`]
/// snapshots and resolves to process names. Unlike the socket-snapshot sources
/// this sees *every* byte event, so it never misses a short-lived connection —
/// but starting the session needs administrator rights.
#[cfg(windows)]
mod etw {
    use super::UsageUnit;
    use ferrisetw::parser::Parser;
    use ferrisetw::provider::Provider;
    use ferrisetw::schema_locator::SchemaLocator;
    use ferrisetw::trace::{TraceTrait, UserTrace};
    use ferrisetw::EventRecord;
    use std::collections::HashMap;
    use std::sync::{LazyLock, Mutex, OnceLock};

    /// Microsoft-Windows-Kernel-Network. `by_guid` takes the GUID as a `u128`.
    const PROVIDER_GUID: u128 = 0x7DD4_2A49_5329_4832_8DFD_43D9_7915_3A88;

    #[derive(Default, Clone, Copy)]
    struct ByteAcc {
        rx: u64,
        tx: u64,
    }

    /// Cumulative bytes per PID since the trace started, written by the ETW
    /// callback and read by [`sample_units`]. Monotonic per PID, so the usage
    /// tracker's delta logic handles it exactly like a kernel counter.
    static ACC: LazyLock<Mutex<HashMap<u32, ByteAcc>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    /// PID → process name, captured while the process is alive so its bytes keep
    /// a meaningful label even after it exits.
    static NAMES: LazyLock<Mutex<HashMap<u32, String>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    /// Whether the trace session started (false = no admin rights / failure).
    static STARTED: OnceLock<bool> = OnceLock::new();

    /// ETW callback: fold each send/receive event's byte count into its PID's
    /// running total. Event IDs come from the provider manifest — 10/26 are TCP
    /// send (IPv4/IPv6), 42/58 UDP send; 11/27/43/59 the matching receives.
    fn on_event(record: &EventRecord, locator: &SchemaLocator) {
        let Ok(schema) = locator.event_schema(record) else {
            return;
        };
        let (is_rx, is_tx) = match record.event_id() {
            10 | 26 | 42 | 58 => (false, true),
            11 | 27 | 43 | 59 => (true, false),
            _ => return,
        };
        let parser = Parser::create(record, &schema);
        let pid: u32 = match parser.try_parse("PID") {
            Ok(v) => v,
            Err(_) => return,
        };
        let size: u32 = match parser.try_parse("size") {
            Ok(v) => v,
            Err(_) => return,
        };

        let mut acc = ACC.lock().unwrap();
        let entry = acc.entry(pid).or_default();
        if is_rx {
            entry.rx = entry.rx.saturating_add(u64::from(size));
        }
        if is_tx {
            entry.tx = entry.tx.saturating_add(u64::from(size));
        }
    }

    /// Start the trace once, on the first sample. The consumer runs on its own
    /// thread (`process_from_handle` blocks); the `UserTrace` is deliberately
    /// leaked so the session lives for the whole process — dropping it would
    /// stop tracing.
    fn ensure_started() {
        STARTED.get_or_init(|| {
            let provider = Provider::by_guid(PROVIDER_GUID).add_callback(on_event).build();
            match UserTrace::new()
                .named(String::from("RoveNetUsage"))
                .enable(provider)
                .start()
            {
                Ok((trace, handle)) => {
                    std::thread::spawn(move || {
                        let _ = UserTrace::process_from_handle(handle);
                    });
                    std::mem::forget(trace);
                    true
                }
                Err(e) => {
                    tracing::warn!("per-app ETW trace could not start (needs admin?): {e:?}");
                    false
                }
            }
        });
    }

    /// True once the ETW session is running.
    pub fn is_active() -> bool {
        *STARTED.get().unwrap_or(&false)
    }

    /// Resolve process names for the given PIDs via sysinfo, caching them so a
    /// process that later exits keeps its label.
    fn refresh_names(pids: &[u32]) {
        use sysinfo::{Pid, ProcessesToUpdate, System};
        static SYS: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new()));

        let mut sys = SYS.lock().unwrap();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let mut names = NAMES.lock().unwrap();
        for &pid in pids {
            if let Some(proc_) = sys.process(Pid::from_u32(pid)) {
                names.insert(pid, proc_.name().to_string_lossy().into_owned());
            }
        }
    }

    /// Snapshot the per-PID accumulator as cumulative [`UsageUnit`]s keyed by
    /// PID. The usage tracker turns these into per-app deltas.
    pub fn sample_units() -> Vec<UsageUnit> {
        ensure_started();

        let snapshot: Vec<(u32, ByteAcc)> = {
            let acc = ACC.lock().unwrap();
            acc.iter().map(|(&pid, &bytes)| (pid, bytes)).collect()
        };
        let pids: Vec<u32> = snapshot.iter().map(|(pid, _)| *pid).collect();
        refresh_names(&pids);

        let names = NAMES.lock().unwrap();
        snapshot
            .into_iter()
            .map(|(pid, bytes)| UsageUnit {
                key: pid.to_string(),
                name: names.get(&pid).cloned().unwrap_or_else(|| format!("PID {pid}")),
                rx: bytes.rx,
                tx: bytes.tx,
                pid: Some(pid),
            })
            .collect()
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
                pid: None,
            }
        );
        assert_eq!(units[1].name, "spotify");
        assert_eq!(units[1].rx, 900);
        assert_eq!(units[1].tx, 1200);
    }

    #[test]
    fn parses_nettop_process_rows() {
        // A header row then two process rows; tolerant of comma or column
        // separation. First numeric column is bytes_in (rx), second bytes_out.
        let out = "\
time,bytes_in,bytes_out,
firefox.1234,52310,18422,
Spotify.567,1200,900,";
        let units = parse_nettop(out);
        assert_eq!(units.len(), 2);
        assert_eq!(
            units[0],
            UsageUnit {
                key: "firefox.1234".into(),
                name: "firefox".into(),
                rx: 52310,
                tx: 18422,
                pid: Some(1234),
            }
        );
        assert_eq!(units[1].name, "Spotify");
        assert_eq!(units[1].pid, Some(567));
    }

    #[test]
    fn accumulates_deltas_per_app_across_ticks() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::Socket);
        // Tick 1 is the first snapshot: this socket was already open, so its
        // reading is a baseline, not traffic.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 100, tx: 40, pid: None }]);
        // Tick 2: the same socket grew — credit only the delta.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 250, tx: 90, pid: None }]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        assert_eq!(s.apps[0].name, "firefox");
        assert_eq!(s.apps[0].rx_bytes, 150);
        assert_eq!(s.apps[0].tx_bytes, 50);
    }

    /// A socket already established when Rove launched arrives carrying its whole
    /// history. Crediting that on first sighting banks bytes we never watched —
    /// which is what made the Hosts view list apps, and totals, that the Apps
    /// view had correctly left out.
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
        // s1's address pair is recycled by a brand-new socket (counter reset
        // low) — its full reading counts, not an underflow.
        t.ingest(vec![
            UsageUnit { key: "s2".into(), name: "firefox".into(), rx: 200, tx: 0, pid: None },
            UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 30, tx: 0, pid: None },
        ]);
        let s = t.summary();
        assert_eq!(s.apps[0].rx_bytes, 500 + 200 + 30);
    }

    /// The mDNSResponder regression: a `nettop -P` per-process counter falls
    /// whenever one of that process's sockets closes and leaves the aggregate.
    /// Crediting the full reading on the way down re-banked the process's entire
    /// history every time — which is how a DNS proxy holding ~130 MB of lifetime
    /// counters and churning a socket per query read as gigabytes.
    #[test]
    fn process_aggregate_source_credits_nothing_when_the_counter_falls() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::ProcessAggregate);
        let tick = |rx: u64| {
            vec![UsageUnit { key: "mDNSResponder.537".into(), name: "mDNSResponder".into(), rx, tx: 0, pid: Some(537) }]
        };
        // First sighting: 132 MB of history that predates us. Baseline only.
        t.ingest(tick(132_000_000));
        // A socket closes and drops out of the aggregate, four times over.
        t.ingest(tick(131_900_000));
        t.ingest(tick(131_800_000));
        t.ingest(tick(131_700_000));
        t.ingest(tick(131_600_000));
        assert!(t.summary().apps.is_empty(), "phantom bytes banked from a falling counter");

        // Real growth from the last baseline still counts.
        t.ingest(tick(131_600_500));
        assert_eq!(t.summary().apps[0].rx_bytes, 500);
    }

    /// A process with no open sockets drops out of `nettop` entirely and comes
    /// back later. Its return is a first sighting again, and must not re-bank the
    /// history it returns carrying.
    #[test]
    fn process_aggregate_source_does_not_rebank_history_on_reappearance() {
        let mut t = AppUsageTracker::with_semantics(CounterSemantics::ProcessAggregate);
        let tick = |rx: u64| vec![UsageUnit { key: "cupsd.99".into(), name: "cupsd".into(), rx, tx: 0, pid: Some(99) }];
        t.ingest(tick(5_000_000));
        t.ingest(tick(5_000_400)); // +400 watched
        t.ingest(vec![]); // all sockets closed: absent from the sample
        t.ingest(tick(5_000_400)); // back, carrying the same history
        assert_eq!(t.summary().apps[0].rx_bytes, 400);
    }

    /// Windows' ETW accumulator is zero-based at Rove's first sample, so unlike a
    /// `nettop` process row or an `ss` socket a first sighting is all traffic we
    /// watched — and the first snapshot must *not* be primed away.
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
