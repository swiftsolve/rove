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
//!   * **macOS** — `nettop` reports cumulative bytes per socket, listing each
//!     process's sockets beneath it, TCP and UDP alike. Sockets whose peer isn't
//!     a host on the network — unconnected mDNS chatter, loopback — are excluded
//!     by the shared `net_util::routable_peer_ip` rule.
//!   * **Windows** — an ETW consumer of the `Microsoft-Windows-Kernel-Network`
//!     provider (see [`mod@etw`]) folds each send/receive event into a per-PID
//!     byte total. It needs administrator rights to start the session, so the
//!     platform reports itself unsupported (rather than empty) until it's up.
//!   * **other** — no per-process source, so reported unsupported.
//!
//! Both supported sources report *cumulative* counters per socket, so, exactly
//! like the interface tracker, [`AppUsageTracker`] keeps the last reading and
//! banks the delta into a per-app running total. Accounting at the socket level
//! means a socket that both opens and closes *between* two samples is missed —
//! the same inherent limitation snapshot-based tools like Sniffnet document —
//! but every socket that lives across a tick is counted in full.
//!
//! # Why not `nettop -P`
//!
//! macOS will happily hand out a per-process total via `nettop -P`, and reading
//! that instead is a trap worth spelling out, because Rove shipped it and it was
//! wrong. `-P` reports the sum over a process's *currently open* sockets: it is a
//! gauge, not an odometer. When a socket closes, its bytes leave the sum.
//!
//! No accumulation strategy recovers from that, because the loss happens before
//! Rove sees the number. Banking every rise re-banks a process's whole history
//! each time the sum dips and then recovers, inventing traffic. Crediting nothing
//! on a dip (the obvious fix) instead *loses* whatever the surviving sockets
//! moved during that same tick — which, for anything holding several concurrent
//! connections that finish and are replaced (a download, a browser), is most of
//! the traffic. Both readings are badly wrong, in opposite directions.
//!
//! The per-socket rows are the same bytes with the information still intact: the
//! process row `-P` would have printed is exactly their sum, so nothing is given
//! up by reading them instead, and a close is now visible as one key going away
//! rather than as an unattributable dip.

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
/// identity for that unit across samples — a socket's address pair on Linux and
/// macOS, a PID on Windows — so [`AppUsageTracker`] can diff it tick to tick.
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
/// *doesn't* simply grow. The sources Rove reads disagree on this, and the
/// disagreement is the whole reason this type exists: the same reading has to be
/// banked differently depending on where it came from.
///
/// Every byte-accurate source Rove reads is keyed by *socket*. That isn't a
/// coincidence — see the module docs on why a per-process aggregate can't be
/// accumulated at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CounterSemantics {
    /// Linux `ss`, and macOS `nettop`'s per-connection rows: one key is one
    /// socket (its local/peer address pair). A live socket's counter only ever
    /// grows, so a decrease means the address pair was recycled by a brand-new
    /// socket carrying its own fresh counter — all of that reading is traffic we
    /// haven't banked. A socket that turns up mid-session counts in full for the
    /// same reason: it opened since the last tick, so its whole counter accrued
    /// while we were watching. The sockets already established in the *first*
    /// snapshot are the exception — see
    /// [`CounterSemantics::primes_on_first_snapshot`].
    Socket,
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
        }
    }

    /// Whether the first snapshot a tracker ever ingests is pure baseline — i.e.
    /// whether the counters it carries can include traffic from before Rove was
    /// watching.
    ///
    /// True for the OS-supplied socket sources: the sockets already open at
    /// launch arrive holding however much they moved beforehand, and this tracker
    /// only claims to count what it saw. False for Windows' ETW accumulator,
    /// which Rove starts itself and so reads zero-based — its first sample is
    /// entirely traffic we watched, and priming it away would lose it.
    pub(crate) const fn primes_on_first_snapshot(self) -> bool {
        match self {
            Self::Socket => true,
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
        CounterSemantics::Socket
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
    // Deliberately *without* -P: that prints one aggregate row per process, which
    // can't be accumulated (see the module docs). Plain nettop prints each
    // process's sockets beneath it, which can. No -m either, so every protocol's
    // sockets are listed, not just TCP. -L 1 one sample then exit, -x raw byte
    // counts (not human units), -n no DNS, -J restricts to our columns.
    #[cfg(target_os = "macos")]
    {
        return crate::shell::try_run("nettop -L 1 -x -n -J bytes_in,bytes_out")
            .await
            .map(|out| parse_nettop_sockets(&out));
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
/// `bytes_sent:`/`bytes_received:`. Sockets without a process (TIME-WAIT, etc.),
/// without byte counters, or whose peer isn't a host on the network (loopback,
/// listeners — the shared [`crate::net_util::routable_peer_ip`] rule) are
/// skipped. Dropping loopback matters especially here: on Linux the kernel lists
/// both ends of a `127.0.0.1` connection as separate sockets, so counting it
/// would bill an app talking to itself twice.
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
                // so pid is left unset. A non-routable peer (loopback, listener)
                // drops the pairing so its info line isn't banked.
                pending = match (local, peer, peer.and_then(crate::net_util::routable_peer_ip)) {
                    (Some(local), Some(peer), Some(_)) => Some((name, format!("{local}|{peer}"))),
                    _ => None,
                };
            }
            None => pending = None,
        }
    }
    units
}

/// Parse `nettop -L 1 -x -n -J bytes_in,bytes_out` (no `-P`) into per-socket
/// readings. nettop alternates a process row (`name.pid`) with that process's
/// socket rows beneath it (`tcp4 local<->peer`, `udp4 local<->peer`, …), each
/// carrying its own cumulative counters. The process row is exactly the sum of
/// the socket rows under it, so it is deliberately read only as the owner for
/// the rows that follow — never banked, because that sum is a gauge over open
/// sockets rather than an odometer (see the module docs).
///
/// Listeners print empty byte columns and are skipped, as are sockets whose peer
/// isn't a host out on the network — wildcards and loopback both, via the shared
/// [`crate::net_util::routable_peer_ip`] rule (see there for why). This module
/// and [`crate::host_usage`] read the same sockets, so they gate on the same
/// rule: a byte that counts as app traffic is a byte that reached some host.
#[cfg(any(target_os = "macos", test))]
fn parse_nettop_sockets(output: &str) -> Vec<UsageUnit> {
    let mut units: Vec<UsageUnit> = Vec::new();
    // The process whose socket rows we're currently reading: (`name.pid`, name, pid).
    let mut current: Option<(String, String, Option<u32>)> = None;

    for line in output.lines() {
        // Split on ',' alone, keeping empty fields, so the byte columns stay at
        // fixed indices — a socket row's label contains spaces, so splitting on
        // whitespace too would shift them.
        let mut fields = line.split(',');
        let Some(label) = fields.next().map(str::trim) else { continue };
        if label.is_empty() {
            continue;
        }

        // A socket row, attributed to the process row above it.
        if let Some((_, peer)) = label.split_once("<->") {
            let Some((owner, name, pid)) = &current else { continue };
            if crate::net_util::routable_peer_ip(peer).is_none() {
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

        // Otherwise a process row, "name.pid" with a numeric pid. Anything else
        // (the header row) clears the owner so stray rows aren't misattributed.
        match label.rsplit_once('.') {
            Some((name, pid))
                if !name.is_empty()
                    && !pid.is_empty()
                    && pid.bytes().all(|b| b.is_ascii_digit()) =>
            {
                current = Some((label.to_string(), name.to_string(), pid.parse().ok()));
            }
            _ => current = None,
        }
    }

    // Defensive: a concrete peer makes a socket's 4-tuple unique, so this should
    // never fire. It matters because the failure is silent and severe — several
    // rows sharing a key don't just lose detail, they re-bank each other's whole
    // counters on every tick (the wildcard rows above did exactly that, reading a
    // music player at 1.4 GB in twelve seconds). Dropping a key we can't tell
    // apart under-counts it; metering it wrong doesn't stay bounded.
    let mut seen: HashMap<String, usize> = HashMap::with_capacity(units.len());
    for unit in &units {
        *seen.entry(unit.key.clone()).or_default() += 1;
    }
    units.retain(|unit| seen.get(&unit.key) == Some(&1));
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

/// A single per-connection reading drawn from the Windows ETW session, feeding
/// the Hosts view. Mirrors the shape [`crate::host_usage`] needs so it can map
/// straight to a `PeerReading` without this module depending on that type.
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

/// Snapshot the per-connection accumulator for the Hosts view. Windows-only;
/// see [`etw::sample_peer_units`].
#[cfg(windows)]
pub(crate) fn windows_peer_units() -> Vec<PeerUnit> {
    etw::sample_peer_units()
}

/// Windows per-app metering via the Microsoft-Windows-Kernel-Network ETW
/// provider. The provider emits one event per network send/receive carrying the
/// owning `PID`, the byte `size`, and the connection's local/remote addresses
/// and ports; a single long-lived consumer thread accumulates those two ways —
/// cumulative per-PID totals for the Apps view ([`sample_units`]) and cumulative
/// per-connection totals tagged with the remote peer for the Hosts view
/// ([`sample_peer_units`]). Unlike the socket-snapshot sources this sees *every*
/// byte event, so it never misses a short-lived connection — but starting the
/// session needs administrator rights.
#[cfg(windows)]
mod etw {
    use super::{PeerUnit, UsageUnit};
    use ferrisetw::parser::Parser;
    use ferrisetw::provider::Provider;
    use ferrisetw::schema_locator::SchemaLocator;
    use ferrisetw::trace::{TraceTrait, UserTrace};
    use ferrisetw::EventRecord;
    use std::collections::{HashMap, HashSet};
    use std::net::IpAddr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{LazyLock, Mutex, RwLock};

    /// Microsoft-Windows-Kernel-Network. `by_guid` takes the GUID as a `u128`.
    const PROVIDER_GUID: u128 = 0x7DD4_2A49_5329_4832_8DFD_43D9_7915_3A88;

    #[derive(Default, Clone, Copy)]
    struct ByteAcc {
        rx: u64,
        tx: u64,
    }

    /// Cumulative bytes for one connection (socket), tagged with its remote peer
    /// and owning PID. `touched` marks whether an event landed on it since the
    /// last sample, so idle/closed connections can be pruned — otherwise the map
    /// would grow without bound as ephemeral ports churn.
    #[derive(Default, Clone)]
    struct PeerAcc {
        pid: u32,
        ip: String,
        port: Option<u16>,
        rx: u64,
        tx: u64,
        touched: bool,
    }

    /// Cumulative bytes per PID since the trace started, written by the ETW
    /// callback and read by [`sample_units`]. Monotonic per PID, so the usage
    /// tracker's delta logic handles it exactly like a kernel counter.
    static ACC: LazyLock<Mutex<HashMap<u32, ByteAcc>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    /// Cumulative bytes per connection, keyed by a stable `local|peer` address
    /// pair, read by [`sample_peer_units`]. Zero-based and monotonic per key
    /// exactly like [`ACC`], so the host tracker diffs it the same way.
    static PEER_ACC: LazyLock<Mutex<HashMap<String, PeerAcc>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    /// This host's own interface addresses, used to pick the *remote* endpoint
    /// out of a connection event's (source, destination) pair. Refreshed each
    /// sample rather than per event — local addresses change rarely.
    static LOCAL_IPS: LazyLock<RwLock<HashSet<IpAddr>>> =
        LazyLock::new(|| RwLock::new(local_ips()));
    /// PID → process name, captured while the process is alive so its bytes keep
    /// a meaningful label even after it exits.
    static NAMES: LazyLock<Mutex<HashMap<u32, String>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    /// Whether the trace session is currently running. Retried every sample
    /// until it sticks rather than latched once: a first attempt can fail for a
    /// recoverable reason (the app was launched before it was elevated, or a
    /// previous session was still tearing down), and giving up for the life of
    /// the process would leave the Apps/Hosts/Traffic views dark even after the
    /// user relaunches as administrator into the same session store.
    static ACTIVE: AtomicBool = AtomicBool::new(false);
    /// Serialises start attempts so a burst of concurrent samples can't race two
    /// sessions open at once.
    static START_LOCK: Mutex<()> = Mutex::new(());

    /// This host's interface IPs. `if-addrs` covers IPv4 and IPv6; an error
    /// (rare) yields an empty set, which just falls the peer pick back to the
    /// send/receive-direction heuristic below.
    fn local_ips() -> HashSet<IpAddr> {
        if_addrs::get_if_addrs()
            .map(|addrs| addrs.into_iter().map(|a| a.ip()).collect())
            .unwrap_or_default()
    }

    /// A Windows `win:Port` field is stored big-endian (network order); ferrisetw
    /// hands back the raw little-endian `u16`, so swap to host order. `0` (no
    /// port) becomes `None`.
    fn host_port(raw: u16) -> Option<u16> {
        let port = raw.swap_bytes();
        (port != 0).then_some(port)
    }

    /// ETW callback: fold each send/receive event's byte count into its PID's
    /// running total (Apps view) and, when the event carries an address pair,
    /// into its connection's running total tagged with the remote peer (Hosts
    /// view). Event IDs come from the provider manifest — 10/26 are TCP send
    /// (IPv4/IPv6), 42/58 UDP send; 11/27/43/59 the matching receives.
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

        // Per-PID total (Apps view) — always credited, even for loopback traffic
        // that the per-peer path below discards.
        {
            let mut acc = ACC.lock().unwrap();
            let entry = acc.entry(pid).or_default();
            if is_rx {
                entry.rx = entry.rx.saturating_add(u64::from(size));
            }
            if is_tx {
                entry.tx = entry.tx.saturating_add(u64::from(size));
            }
        }

        // Per-connection total (Hosts view). Both directions of a flow carry the
        // same (saddr, daddr) pair, so keying on it groups them; the remote peer
        // is whichever endpoint isn't one of this host's own addresses. That test
        // sidesteps having to know whether the provider labels addresses by
        // packet direction or by connection role. `saddr`/`daddr` parse as either
        // IPv4 or IPv6 depending on the event; a parse miss just skips the peer
        // side, leaving the per-PID total intact.
        let (Ok(saddr), Ok(daddr)) =
            (parser.try_parse::<IpAddr>("saddr"), parser.try_parse::<IpAddr>("daddr"))
        else {
            return;
        };
        let sport: u16 = parser.try_parse("sport").unwrap_or(0);
        let dport: u16 = parser.try_parse("dport").unwrap_or(0);

        let (local_ip, local_port, peer_ip, peer_port) = {
            let locals = LOCAL_IPS.read().unwrap();
            let saddr_local = locals.contains(&saddr);
            let daddr_local = locals.contains(&daddr);
            match (saddr_local, daddr_local) {
                (true, false) => (saddr, sport, daddr, dport),
                (false, true) => (daddr, dport, saddr, sport),
                // Both local → loopback / same-host traffic: not a remote host.
                (true, true) => return,
                // Neither recognised (empty/stale local set): fall back to the
                // packet-direction convention — on send the peer is the
                // destination, on receive it's the source.
                (false, false) => {
                    if is_tx {
                        (saddr, sport, daddr, dport)
                    } else {
                        (daddr, dport, saddr, sport)
                    }
                }
            }
        };

        let conn_key = format!(
            "{local_ip}:{}|{peer_ip}:{}",
            host_port(local_port).unwrap_or(0),
            host_port(peer_port).unwrap_or(0)
        );
        let mut peers = PEER_ACC.lock().unwrap();
        let entry = peers.entry(conn_key).or_insert_with(|| PeerAcc {
            pid,
            ip: peer_ip.to_string(),
            port: host_port(peer_port),
            ..PeerAcc::default()
        });
        entry.touched = true;
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
        if ACTIVE.load(Ordering::Acquire) {
            return;
        }
        let _guard = START_LOCK.lock().unwrap();
        // Another sample may have started it while we waited on the lock.
        if ACTIVE.load(Ordering::Acquire) {
            return;
        }
        let provider = Provider::by_guid(PROVIDER_GUID).add_callback(on_event).build();
        match UserTrace::new().named(String::from("RoveNetUsage")).enable(provider).start() {
            Ok((trace, handle)) => {
                std::thread::spawn(move || {
                    let _ = UserTrace::process_from_handle(handle);
                });
                std::mem::forget(trace);
                ACTIVE.store(true, Ordering::Release);
            }
            // Left inactive so the next sample retries. The usual cause is
            // running without elevation; the app's manifest requests it, but a
            // dev/unbundled run or a denied UAC prompt lands here.
            Err(e) => {
                tracing::warn!(
                    "per-app ETW trace could not start — run Rove as administrator ({e:?})"
                );
            }
        }
    }

    /// True while the ETW session is running.
    pub fn is_active() -> bool {
        ACTIVE.load(Ordering::Acquire)
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

    /// Snapshot the per-connection accumulator as cumulative [`PeerUnit`]s for the
    /// Hosts view. Connections that saw no event since the previous sample (a
    /// closed or idle flow) are pruned here — their bytes are already banked by
    /// the host tracker, and their ephemeral-port key won't recur, so dropping
    /// them just bounds the map.
    pub fn sample_peer_units() -> Vec<PeerUnit> {
        ensure_started();
        *LOCAL_IPS.write().unwrap() = local_ips();

        let snapshot: Vec<(String, PeerAcc)> = {
            let mut peers = PEER_ACC.lock().unwrap();
            peers.retain(|_, e| e.touched);
            let snap: Vec<(String, PeerAcc)> =
                peers.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            for e in peers.values_mut() {
                e.touched = false;
            }
            snap
        };
        let pids: Vec<u32> = snapshot.iter().map(|(_, e)| e.pid).collect();
        refresh_names(&pids);

        let names = NAMES.lock().unwrap();
        snapshot
            .into_iter()
            .map(|(conn_key, e)| PeerUnit {
                conn_key,
                name: names.get(&e.pid).cloned().unwrap_or_else(|| format!("PID {}", e.pid)),
                pid: e.pid,
                ip: e.ip,
                port: e.port,
                rx: e.rx,
                tx: e.tx,
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
        // sum of its sockets, so it must never become a unit of its own —
        // banking both would double-count. Listeners print empty byte columns.
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

    /// The TIDAL regression. One process holding several unconnected sockets that
    /// print the *identical* label with different counters is real nettop output,
    /// and nothing distinguishes them. Keyed together they telescope — each tick
    /// credits the largest counter afresh — which read a music player at 1.4 GB
    /// in twelve seconds. They must not be metered at all.
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
    /// unit tests live with the rule, in `net_util`; this pins that the parser
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

    /// The appstored regression, and the reason this module reads sockets rather
    /// than `nettop -P`: a downloader holds several connections at once, and they
    /// finish and are replaced while the others are still pulling. Summed per
    /// process the tick nets out *downwards* — a fall — so an aggregate reader
    /// banks nothing and the surviving sockets' traffic vanishes. Per socket it
    /// is all still there. Read as `-P` this tick looks like 20 MB -> 17 MB;
    /// 7 MB really moved.
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
        let tick = |rx: u64| vec![UsageUnit { key: "cupsd.99|tcp4 a<->b".into(), name: "cupsd".into(), rx, tx: 0, pid: Some(99) }];
        t.ingest(tick(5_000_000)); // first snapshot: baseline
        t.ingest(tick(5_000_400)); // +400 watched
        t.ingest(vec![]); // socket closed: absent from the sample
        // The address pair is recycled by a new socket, counting from scratch.
        t.ingest(tick(600));
        assert_eq!(t.summary().apps[0].rx_bytes, 1000);
    }

    /// Windows' ETW accumulator is zero-based at Rove's first sample, so unlike
    /// an `ss` or `nettop` socket a first sighting is all traffic we watched —
    /// and the first snapshot must *not* be primed away.
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
