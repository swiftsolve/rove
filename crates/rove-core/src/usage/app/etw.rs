//! Windows per-app metering via the Microsoft-Windows-Kernel-Network ETW
//! provider. The provider emits one event per network send/receive carrying the
//! owning `PID`, the byte `size`, and the connection's local/remote addresses
//! and ports; a single long-lived consumer thread accumulates those two ways —
//! cumulative per-PID totals for the Apps view ([`sample_units`]) and cumulative
//! per-connection totals tagged with the remote peer for the Hosts view
//! ([`sample_peer_units`]). Unlike the socket-snapshot sources this sees *every*
//! byte event, so it never misses a short-lived connection — but starting the
//! session needs administrator rights.
//!
//! The network provider identifies traffic only by PID, which is not enough on
//! its own: a PID cannot be named once its process has exited, and Windows
//! recycles PIDs freely enough that one number can mean two programs over a
//! session. Microsoft-Windows-Kernel-Process is enabled on the same session to
//! supply both missing pieces — a name at process start, and a boundary at
//! process stop. See [`Instance`].
use super::{PeerUnit, UsageUnit};
use ferrisetw::native::EvntraceNativeError;
use ferrisetw::parser::Parser;
use ferrisetw::provider::Provider;
use ferrisetw::schema_locator::SchemaLocator;
use ferrisetw::trace::{stop_trace_by_name, TraceError, TraceTrait, UserTrace};
use ferrisetw::EventRecord;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex, RwLock};

/// Microsoft-Windows-Kernel-Network. `by_guid` takes the GUID as a `u128`.
const PROVIDER_GUID: u128 = 0x7DD4_2A49_5329_4832_8DFD_43D9_7915_3A88;

/// Microsoft-Windows-Kernel-Process, enabled on the same session purely to
/// name processes. The network provider reports only a PID, and a PID is both
/// unnameable once the process exits and ambiguous once Windows recycles it —
/// this provider closes both gaps at the source. See [`Instance`].
const PROCESS_PROVIDER_GUID: u128 = 0x22FB_2CD6_0E7B_422B_A0C7_2FAD_1FD0_E716;

/// `WINEVENT_KEYWORD_PROCESS` — the Kernel-Process provider's process
/// start/stop keyword. Without a keyword filter the provider also emits
/// thread, image-load and CPU-priority events at a volume that dwarfs the
/// network stream, for events this module would discard anyway.
const KEYWORD_PROCESS: u64 = 0x10;

/// Kernel-Process event IDs, from the provider manifest.
const EVENT_PROCESS_START: u16 = 1;
const EVENT_PROCESS_STOP: u16 = 2;

/// The ETW session name. Kernel trace sessions are system-global and keyed by
/// this name, which is why a prior Rove process's session can still be alive
/// when we launch again — see [`ensure_started`].
const SESSION_NAME: &str = "RoveNetUsage";

/// The label for bytes Rove could not attribute to a named process. Every
/// such instance collapses into this single row — the tracker banks totals by
/// name — rather than a scatter of `PID 4821` rows that mean nothing to a
/// reader and, since the process is already gone, can never resolve into
/// anything better.
const UNRESOLVED_LABEL: &str = "Short-lived processes";

/// Identifies one *run* of a process: a PID in the low 32 bits, a generation
/// counter in the high 32. Windows recycles PIDs aggressively, so a raw PID is
/// not a stable identity — keying the accumulators on one merges a dead
/// process's bytes with those of whatever inherits its number, and (because
/// the new process's zero-based counter reads as a *decrease*) makes
/// [`CounterSemantics::PidAccumulator`] credit the newcomer nothing until it
/// exceeds the total of the process it replaced.
///
/// The generation bumps on every Kernel-Process `ProcessStart` for that PID,
/// so each run gets its own key, its own name, and its own zero baseline.
/// Generation 0 means "already running when the trace opened" — no
/// `ProcessStart` was ever seen for it, and it is therefore the only case
/// where a bare PID can still be resolved against the live process table.
type Instance = u64;

const fn instance(pid: u32, generation: u32) -> Instance {
    ((generation as u64) << 32) | pid as u64
}

const fn instance_pid(inst: Instance) -> u32 {
    inst as u32
}

const fn instance_generation(inst: Instance) -> u32 {
    (inst >> 32) as u32
}

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
    inst: Instance,
    ip: String,
    port: Option<u16>,
    rx: u64,
    tx: u64,
    touched: bool,
}

/// Cumulative bytes per process instance since the trace started, written by
/// the ETW callback and read by [`sample_units`]. Monotonic per instance, so
/// the usage tracker's delta logic handles it exactly like a kernel counter.
static ACC: LazyLock<Mutex<HashMap<Instance, ByteAcc>>> =
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
/// Instance → process name. `Some(None)` is a tombstone: the name was looked
/// for and could not be had, so the (comparatively expensive) lookups aren't
/// retried on every subsequent event for a PID that is already gone.
///
/// Three sources fill this, in descending order of reliability: the
/// Kernel-Process `ProcessStart` event ([`on_process_event`], authoritative
/// and immune to the process exiting), a `QueryFullProcessImageNameW` on
/// first sighting ([`note_instance`]), and the process table at sample time
/// ([`refresh_names`]).
static NAMES: LazyLock<RwLock<HashMap<Instance, Option<String>>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));
/// PID → how many times the Kernel-Process provider has seen it start. Absent
/// means generation 0. Bounded by the OS's PID space (and in practice by the
/// few thousand values it cycles through), at 12 bytes an entry.
static GENERATION: LazyLock<RwLock<HashMap<u32, u32>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));
/// Instances whose process has exited, awaiting one last sample before
/// [`prune_ended`] drops them.
static ENDED: LazyLock<Mutex<HashSet<Instance>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
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
/// The last failure from [`ensure_started`], surfaced in the UI's
/// unsupported state so a user (or we) can see *why* the session won't open
/// without hunting the log. `None` once it's running.
static LAST_ERROR: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

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

/// The instance a PID currently refers to.
fn current_instance(pid: u32) -> Instance {
    let generation = GENERATION.read().unwrap().get(&pid).copied().unwrap_or(0);
    instance(pid, generation)
}

/// The file name out of a Kernel-Process `ImageName`, which is an NT device
/// path (`\Device\HarddiskVolume4\Windows\System32\svchost.exe`). Reducing it
/// to the bare `svchost.exe` that sysinfo reports is not cosmetic: the tracker
/// banks totals keyed by *name*, so two spellings of one program would split
/// it into two rows that each tell half the truth.
fn image_base_name(raw: &str) -> Option<String> {
    let base = raw.rsplit(['\\', '/']).next()?.trim();
    (!base.is_empty()).then(|| base.to_owned())
}

/// Kernel-Process callback. `ProcessStart` opens a new generation for the PID
/// and records the name the kernel reports — which is what lets a process that
/// lives and dies entirely between two samples still be named, and what keeps
/// a recycled PID from inheriting its predecessor's identity. `ProcessStop`
/// only marks the instance for pruning; its bytes are still owed one sample.
///
/// Note the name must come from the payload's `ProcessID`, not
/// `record.process_id()` — the latter is the process that *emitted* the event,
/// i.e. the parent doing the creating.
fn on_process_event(record: &EventRecord, locator: &SchemaLocator) {
    let event_id = record.event_id();
    if event_id != EVENT_PROCESS_START && event_id != EVENT_PROCESS_STOP {
        return;
    }
    let Ok(schema) = locator.event_schema(record) else {
        return;
    };
    let parser = Parser::create(record, &schema);
    let Ok(pid) = parser.try_parse::<u32>("ProcessID") else {
        return;
    };

    if event_id == EVENT_PROCESS_STOP {
        ENDED.lock().unwrap().insert(current_instance(pid));
        return;
    }

    let inst = {
        let mut generations = GENERATION.write().unwrap();
        let generation = generations.entry(pid).and_modify(|g| *g += 1).or_insert(1);
        instance(pid, *generation)
    };
    let name = parser
        .try_parse::<String>("ImageName")
        .ok()
        .as_deref()
        .and_then(image_base_name);
    NAMES.write().unwrap().insert(inst, name);
}

/// Resolve a name the moment an instance's first byte lands, so a process that
/// dies before the next sample still gets a label.
///
/// Only generation 0 needs this: anything the Kernel-Process provider watched
/// start was named from its `ProcessStart` event, and anything above
/// generation 0 cannot be looked up by bare PID anyway. That leaves the
/// processes that were already running when the trace opened — long-lived as a
/// rule, so this is a backstop rather than the main path. A failure is
/// tombstoned so a protected or already-dead PID isn't reopened per event.
fn note_instance(inst: Instance) {
    if instance_generation(inst) != 0 || NAMES.read().unwrap().contains_key(&inst) {
        return;
    }
    let name = crate::platform::app_icon::exe_path_for_pid(instance_pid(inst))
        .and_then(|path| path.file_name().map(|f| f.to_string_lossy().into_owned()));
    NAMES.write().unwrap().insert(inst, name);
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

    let inst = current_instance(pid);
    note_instance(inst);

    // Per-instance total (Apps view) — always credited, even for loopback
    // traffic that the per-peer path below discards.
    {
        let mut acc = ACC.lock().unwrap();
        let entry = acc.entry(inst).or_default();
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
        inst,
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

/// Start the trace once, on the first sample, recovering from a stale session
/// left by a previous run. A first attempt that fails with `AlreadyExist`
/// means a `RoveNetUsage` session from an earlier Rove process is still
/// registered in the kernel — the `UserTrace` is deliberately leaked (so the
/// session lives for the whole process) and is therefore never stopped, not
/// on a crash nor even on a clean exit. That's not an elevation problem, so
/// stop the orphan by name and retry once before blaming the start error on
/// the UI's unsupported state.
fn ensure_started() {
    if ACTIVE.load(Ordering::Acquire) {
        return;
    }
    let _guard = START_LOCK.lock().unwrap();
    // Another sample may have started it while we waited on the lock.
    if ACTIVE.load(Ordering::Acquire) {
        return;
    }
    match try_start() {
        Ok(()) => {}
        Err(TraceError::EtwNativeError(EvntraceNativeError::AlreadyExist)) => {
            if let Err(e) = stop_trace_by_name(SESSION_NAME) {
                tracing::warn!("could not stop stale ETW session {SESSION_NAME}: {e:?}");
            }
            if let Err(e) = try_start() {
                record_start_error(&e);
            }
        }
        Err(e) => record_start_error(&e),
    }
}

/// One attempt to open the trace. On success the consumer runs on its own
/// thread (`process_from_handle` blocks) and the `UserTrace` is deliberately
/// leaked so the session lives for the whole process — dropping it would stop
/// tracing.
/// One attempt to open the trace. Both providers ride the same session: one
/// consumer thread, one privilege check, and process events interleaved with
/// the network events they explain. The process provider is enabled first so
/// its `ProcessStart` events lead the network traffic they name.
fn try_start() -> Result<(), TraceError> {
    let processes = Provider::by_guid(PROCESS_PROVIDER_GUID)
        .add_callback(on_process_event)
        .any(KEYWORD_PROCESS)
        .build();
    let provider = Provider::by_guid(PROVIDER_GUID).add_callback(on_event).build();
    let (trace, handle) = UserTrace::new()
        .named(String::from(SESSION_NAME))
        .enable(processes)
        .enable(provider)
        .start()?;
    std::thread::spawn(move || {
        let _ = UserTrace::process_from_handle(handle);
    });
    std::mem::forget(trace);
    ACTIVE.store(true, Ordering::Release);
    *LAST_ERROR.lock().unwrap() = None;
    Ok(())
}

/// Record a start failure for the UI's unsupported state, leaving the session
/// inactive so the next sample retries. The usual cause is running without
/// elevation, but not the only one — keep the exact error so the UI can show
/// it rather than only blaming elevation.
fn record_start_error(e: &TraceError) {
    let detail = format!("{e:?}");
    tracing::warn!("per-app ETW trace could not start: {detail}");
    *LAST_ERROR.lock().unwrap() = Some(detail);
}

/// True while the ETW session is running.
pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}

/// The last ETW start failure, or `None` while the session is running. Shown
/// in the unsupported state so the real cause is visible.
pub fn last_error() -> Option<String> {
    if ACTIVE.load(Ordering::Acquire) {
        return None;
    }
    LAST_ERROR.lock().unwrap().clone()
}

/// Last-resort naming via the process table, for instances the two cheaper
/// sources missed. Only generation-0 instances are eligible — a higher
/// generation means the PID has been recycled since, so whatever holds it now
/// is a different program and would be a mislabel, not a rescue.
///
/// The scan is skipped outright when everything is already named, which is the
/// common case now that `ProcessStart` names processes as they appear: this
/// used to walk the entire process table twice every 10 seconds.
fn refresh_names(instances: &[Instance]) {
    use sysinfo::{Pid, ProcessesToUpdate, System};
    static SYS: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new()));

    let unresolved: Vec<Instance> = {
        let names = NAMES.read().unwrap();
        instances
            .iter()
            .copied()
            .filter(|inst| instance_generation(*inst) == 0)
            .filter(|inst| !matches!(names.get(inst), Some(Some(_))))
            .collect()
    };
    if unresolved.is_empty() {
        return;
    }

    let mut sys = SYS.lock().unwrap();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let mut names = NAMES.write().unwrap();
    for inst in unresolved {
        if let Some(proc_) = sys.process(Pid::from_u32(instance_pid(inst))) {
            names.insert(inst, Some(proc_.name().to_string_lossy().into_owned()));
        }
    }
}

/// The display name for an instance, falling back to the shared
/// [`UNRESOLVED_LABEL`] bucket.
fn label(names: &HashMap<Instance, Option<String>>, inst: Instance) -> String {
    names
        .get(&inst)
        .cloned()
        .flatten()
        .unwrap_or_else(|| UNRESOLVED_LABEL.to_owned())
}

/// Forget instances whose process has exited, but only once the bytes in
/// `sampled` have been handed to the tracker.
///
/// Deferring the drop to *after* the snapshot is the whole point: a process
/// that lived and died between two samples would otherwise be evicted before
/// it was ever counted, and its traffic would vanish. Once it has been
/// reported the tracker banks its total the moment the key stops appearing, so
/// dropping it here costs nothing and bounds both maps against a long session.
///
/// Only [`sample_units`] may call this — it is the reader of [`ACC`], and
/// pruning from the peer path could drop an instance's bytes before the Apps
/// view had ever seen them.
fn prune_ended(sampled: &[Instance]) {
    let done: Vec<Instance> = {
        let mut ended = ENDED.lock().unwrap();
        if ended.is_empty() {
            return;
        }
        let done: Vec<Instance> =
            sampled.iter().copied().filter(|inst| ended.contains(inst)).collect();
        for inst in &done {
            ended.remove(inst);
        }
        done
    };
    if done.is_empty() {
        return;
    }
    let mut acc = ACC.lock().unwrap();
    let mut names = NAMES.write().unwrap();
    for inst in &done {
        acc.remove(inst);
        names.remove(inst);
    }
}

/// Snapshot the per-PID accumulator as cumulative [`UsageUnit`]s keyed by
/// PID. The usage tracker turns these into per-app deltas.
pub fn sample_units() -> Vec<UsageUnit> {
    ensure_started();

    let snapshot: Vec<(Instance, ByteAcc)> = {
        let acc = ACC.lock().unwrap();
        acc.iter().map(|(&inst, &bytes)| (inst, bytes)).collect()
    };
    let instances: Vec<Instance> = snapshot.iter().map(|(inst, _)| *inst).collect();
    refresh_names(&instances);

    let units: Vec<UsageUnit> = {
        let names = NAMES.read().unwrap();
        snapshot
            .into_iter()
            .map(|(inst, bytes)| UsageUnit {
                // Keyed by instance, not PID: a recycled PID must read as a
                // new key so the tracker gives it a fresh baseline instead of
                // diffing it against the process it replaced.
                key: format!("{}#{}", instance_pid(inst), instance_generation(inst)),
                name: label(&names, inst),
                rx: bytes.rx,
                tx: bytes.tx,
                pid: Some(instance_pid(inst)),
            })
            .collect()
    };
    prune_ended(&instances);
    units
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
    let instances: Vec<Instance> = snapshot.iter().map(|(_, e)| e.inst).collect();
    refresh_names(&instances);

    // No `prune_ended` here — see its docs; `sample_units` owns eviction.
    let names = NAMES.read().unwrap();
    snapshot
        .into_iter()
        .map(|(conn_key, e)| PeerUnit {
            conn_key,
            name: label(&names, e.inst),
            pid: instance_pid(e.inst),
            ip: e.ip,
            port: e.port,
            rx: e.rx,
            tx: e.tx,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The kernel reports an NT device path; the process table reports a bare
    /// file name. They have to agree, or one program banks under two rows.
    #[test]
    fn image_name_reduces_to_the_bare_file_name() {
        assert_eq!(
            image_base_name(r"\Device\HarddiskVolume4\Windows\System32\svchost.exe").as_deref(),
            Some("svchost.exe"),
        );
        assert_eq!(
            image_base_name(r"C:\Program Files\Rove\Rove.exe").as_deref(),
            Some("Rove.exe"),
        );
        // Nothing usable rather than an empty label the UI would render blank.
        assert_eq!(image_base_name(""), None);
        assert_eq!(image_base_name(r"C:\dir\"), None);
    }

    /// The packing has to survive a PID above `i32::MAX` — Windows PIDs are
    /// unsigned and a busy host does reach high numbers.
    #[test]
    fn instance_round_trips_pid_and_generation() {
        for (pid, generation) in [(0u32, 0u32), (4821, 3), (u32::MAX, 1), (7, u32::MAX)] {
            let inst = instance(pid, generation);
            assert_eq!(instance_pid(inst), pid);
            assert_eq!(instance_generation(inst), generation);
        }
        // Distinct runs of one PID must not collide.
        assert_ne!(instance(4821, 1), instance(4821, 2));
    }
}
