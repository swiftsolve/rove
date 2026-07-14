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
}

/// Take one snapshot of per-unit cumulative byte counters from the OS. Empty on
/// an unsupported platform, or when the source tool is missing/returns nothing
/// (e.g. no open TCP sockets) — the platform's *capability* is reported
/// separately by [`platform_support`], so an idle machine reads as "supported,
/// nothing yet" rather than "unsupported".
pub async fn sample_units() -> Vec<UsageUnit> {
    // -t TCP only (UDP has no byte counters in the diag interface), -i socket
    // info (the bytes), -n numeric, -H no header, -p process.
    #[cfg(target_os = "linux")]
    {
        return match crate::shell::try_run("ss -tinHp").await {
            Some(out) => parse_ss(&out),
            None => Vec::new(),
        };
    }
    // -P per-process (no per-connection sub-rows), -L 1 one sample then exit, -x
    // raw byte counts (not human units), -n no DNS, -J restricts to our columns.
    #[cfg(target_os = "macos")]
    {
        return match crate::shell::try_run("nettop -P -L 1 -x -n -J bytes_in,bytes_out").await {
            Some(out) => parse_nettop(&out),
            None => Vec::new(),
        };
    }
    // Windows reads a running ETW accumulator rather than shelling out; this is
    // a synchronous snapshot, so there's nothing to await.
    #[cfg(windows)]
    {
        return etw::sample_units();
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        Vec::new()
    }
}

/// Read an unsigned field written as `key<digits>` out of a whitespace-joined
/// line — e.g. `bytes_sent:5231` → `5231`.
#[cfg(any(target_os = "linux", test))]
fn field_u64(line: &str, key: &str) -> Option<u64> {
    let start = line.find(key)? + key.len();
    let digits: String = line[start..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// The first process name from an `ss -p` process column, i.e. the `NAME` in
/// `users:(("NAME",pid=123,fd=45))`.
#[cfg(any(target_os = "linux", test))]
fn ss_proc_name(line: &str) -> Option<String> {
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
                units.push(UsageUnit { key, name, rx, tx });
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
        units.push(UsageUnit { key: (*first).to_string(), name: name.to_string(), rx, tx });
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
}

impl AppUsageTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold one snapshot into the running totals. For each unit, credit the
    /// delta since its last reading; a unit seen for the first time (or whose
    /// counter went backwards because its key was reused by a fresh socket)
    /// contributes its full current reading. Units that vanished since last tick
    /// are forgotten — their bytes are already banked in `totals`, so `last`
    /// never grows without bound across a long session.
    pub fn ingest(&mut self, units: Vec<UsageUnit>) {
        if self.since.is_none() {
            self.since = Some(crate::net_util::now_ms());
        }

        let mut seen = HashSet::with_capacity(units.len());
        for unit in units {
            let prev = self.last.get(&unit.key).copied();
            let delta = |now: u64, was: Option<u64>| match was {
                // A decrease means the key was reused by a new unit, not a
                // negative transfer: bank the new unit's full reading, never a
                // phantom underflow.
                Some(p) if now >= p => now - p,
                _ => now,
            };
            let drx = delta(unit.rx, prev.map(|p| p.rx));
            let dtx = delta(unit.tx, prev.map(|p| p.tx));

            self.last.insert(unit.key.clone(), ByteCounts { rx: unit.rx, tx: unit.tx });
            seen.insert(unit.key);

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
            .map(|(name, b)| AppUsage { name: name.clone(), rx_bytes: b.rx, tx_bytes: b.tx })
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
        assert_eq!(units[0], UsageUnit { key: "firefox.1234".into(), name: "firefox".into(), rx: 52310, tx: 18422 });
        assert_eq!(units[1].name, "Spotify");
    }

    #[test]
    fn accumulates_deltas_per_app_across_ticks() {
        let mut t = AppUsageTracker::new();
        // Tick 1: a fresh socket contributes its full reading.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 100, tx: 40 }]);
        // Tick 2: the same socket grew — credit only the delta.
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 250, tx: 90 }]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        assert_eq!(s.apps[0].name, "firefox");
        assert_eq!(s.apps[0].rx_bytes, 250);
        assert_eq!(s.apps[0].tx_bytes, 90);
    }

    #[test]
    fn banks_closed_sockets_and_counts_reused_keys_fresh() {
        let mut t = AppUsageTracker::new();
        t.ingest(vec![UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 500, tx: 0 }]);
        // s1 closed (absent this tick); its 500 stays banked. A new socket s2
        // for the same app opens with its own cumulative counter.
        t.ingest(vec![UsageUnit { key: "s2".into(), name: "firefox".into(), rx: 200, tx: 0 }]);
        // s1's key reappears as a brand-new socket (counter reset low) — its
        // full reading counts, not an underflow.
        t.ingest(vec![
            UsageUnit { key: "s2".into(), name: "firefox".into(), rx: 200, tx: 0 },
            UsageUnit { key: "s1".into(), name: "firefox".into(), rx: 30, tx: 0 },
        ]);
        let s = t.summary();
        assert_eq!(s.apps[0].rx_bytes, 500 + 200 + 30);
    }

    #[test]
    fn sums_multiple_processes_sharing_a_name() {
        let mut t = AppUsageTracker::new();
        t.ingest(vec![
            UsageUnit { key: "a".into(), name: "chrome".into(), rx: 100, tx: 10 },
            UsageUnit { key: "b".into(), name: "chrome".into(), rx: 300, tx: 20 },
        ]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        assert_eq!(s.apps[0].rx_bytes, 400);
        assert_eq!(s.apps[0].tx_bytes, 30);
    }
}
