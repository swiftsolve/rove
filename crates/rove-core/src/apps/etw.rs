//! Windows per-app metering via the Microsoft-Windows-Kernel-Network ETW
//! provider. It emits one event per send/receive with the `PID`, byte `size`
//! and the connection's addresses and ports. One long-lived consumer thread
//! accumulates them two ways: per process for the Apps view ([`sample_units`])
//! and per connection, tagged with the peer, for the Hosts view
//! ([`sample_peer_units`]). Unlike the socket snapshots on Linux and macOS it
//! sees every event, so short-lived connections aren't missed, but starting the
//! session needs administrator rights.
//!
//! A bare PID isn't enough: it can't be named once the process exits, and
//! Windows recycles PIDs freely enough that one number can mean two programs in
//! a session. Microsoft-Windows-Kernel-Process, on the same session, supplies a
//! name at process start and a boundary at process stop. See [`Instance`].
use super::UsageUnit;
use crate::utils::net::is_routable_peer;
use ferrisetw::native::EvntraceNativeError;
use ferrisetw::parser::Parser;
use ferrisetw::provider::Provider;
use ferrisetw::schema_locator::SchemaLocator;
use ferrisetw::trace::{stop_trace_by_name, TraceError, TraceTrait, UserTrace};
use ferrisetw::EventRecord;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};

/// One per-connection reading from the Windows ETW session, for the Hosts view.
/// Shaped like `apps::hosts::PeerReading`, which `usage::windows` maps it to.
pub struct PeerUnit {
    pub conn_key: String,
    pub name: String,
    pub pid: u32,
    pub ip: String,
    pub port: Option<u16>,
    pub rx: u64,
    pub tx: u64,
}

/// Microsoft-Windows-Kernel-Network. `by_guid` takes the GUID as a `u128`.
const PROVIDER_GUID: u128 = 0x7DD4_2A49_5329_4832_8DFD_43D9_7915_3A88;

/// Microsoft-Windows-Kernel-Process, enabled on the same session only to name
/// processes and mark where a PID's run ends. See [`Instance`].
const PROCESS_PROVIDER_GUID: u128 = 0x22FB_2CD6_0E7B_422B_A0C7_2FAD_1FD0_E716;

/// `WINEVENT_KEYWORD_PROCESS`, the Kernel-Process start/stop keyword. Without
/// it the provider also emits thread, image-load and CPU-priority events at a
/// volume that dwarfs the network stream, all of them discarded here.
const KEYWORD_PROCESS: u64 = 0x10;

/// Kernel-Process event IDs, from the provider manifest.
const EVENT_PROCESS_START: u16 = 1;
const EVENT_PROCESS_STOP: u16 = 2;

/// The ETW session name. Sessions are system-wide and keyed by name, so an
/// earlier Rove process's session can still be alive at launch; see
/// [`ensure_started`].
const SESSION_NAME: &str = "RoveNetUsage";

/// The label for bytes Rove couldn't attribute to a named process. The tracker
/// banks by name, so they all collapse into one row rather than a scatter of
/// `PID 4821` rows that mean nothing and, with the process gone, never will.
const UNRESOLVED_LABEL: &str = "Short-lived processes";

/// One *run* of a process: the PID in the low 32 bits, a generation in the high
/// 32. Keyed by bare PID, a dead process's bytes would merge with whatever
/// inherits the number, and the newcomer's zero-based counter would read as a
/// decrease, so [`CounterSemantics::PidAccumulator`] would credit it nothing.
///
/// The generation bumps on each Kernel-Process `ProcessStart` for the PID, so
/// every run gets its own key, name and zero baseline. Generation 0 means
/// "already running when the trace opened": no `ProcessStart` was seen, and
/// it's the only case where the bare PID can still be looked up in the live
/// process table.
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

/// Cumulative bytes for one connection, tagged with its peer and process.
/// `touched` marks an event since the last sample, so idle or closed
/// connections can be pruned before ephemeral-port churn grows the map without
/// bound.
#[derive(Default, Clone)]
struct PeerAcc {
    inst: Instance,
    ip: String,
    port: Option<u16>,
    rx: u64,
    tx: u64,
    touched: bool,
}

/// Cumulative bytes per process instance since the trace started, read by
/// [`sample_units`]. Monotonic per instance, so the tracker diffs it like a
/// kernel counter.
static ACC: LazyLock<Mutex<HashMap<Instance, ByteAcc>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
/// Cumulative bytes per connection, keyed by its `local|peer` address pair,
/// read by [`sample_peer_units`]. Zero-based and monotonic like [`ACC`].
static PEER_ACC: LazyLock<Mutex<HashMap<String, PeerAcc>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
/// This host's addresses, to tell which end of an event's (source,
/// destination) pair is the peer. Refreshed per sample, not per event, since
/// they rarely change.
static LOCAL_IPS: LazyLock<RwLock<HashSet<IpAddr>>> = LazyLock::new(|| RwLock::new(local_ips()));
/// Instance to process name. `Some(None)` is a tombstone: the lookup failed,
/// so it isn't retried on every event for a PID that's already gone.
///
/// Filled from three sources, most reliable first: the `ProcessStart` event
/// ([`on_process_event`], unaffected by the process exiting), a
/// `QueryFullProcessImageNameW` on first sighting ([`note_instance`]), and the
/// process table at sample time ([`refresh_names`]).
static NAMES: LazyLock<RwLock<HashMap<Instance, Option<String>>>> = LazyLock::new(|| RwLock::new(HashMap::new()));
/// PID to how many times it has been seen to start; absent means generation
/// 0. Bounded by the PID space, in practice a few thousand values.
static GENERATION: LazyLock<RwLock<HashMap<u32, u32>>> = LazyLock::new(|| RwLock::new(HashMap::new()));
/// Instances whose process has exited, awaiting one last sample before
/// [`prune_ended`] drops them.
static ENDED: LazyLock<Mutex<HashSet<Instance>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
/// Whether the trace session is running. Start is retried every sample until
/// it sticks, not tried once: a first attempt can fail for a recoverable reason
/// (a previous session still tearing down), and giving up would leave the
/// Apps, Hosts and Traffic views dark for the rest of the run.
static ACTIVE: AtomicBool = AtomicBool::new(false);
/// Serialises start attempts so concurrent samples can't open two sessions.
static START_LOCK: Mutex<()> = Mutex::new(());
/// The last [`ensure_started`] failure, shown in the UI's unsupported state so
/// the cause is visible without the log. `None` once it's running.
static LAST_ERROR: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

// The locks below are taken through these, which carry on past a poisoned lock
// instead of panicking. A panic mid-update leaves at worst one stale counter or
// name, but a poisoned global would panic every later event and sample, so the
// ETW callback thread and the Apps and Hosts views would die with it.

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn read<T>(rw: &RwLock<T>) -> RwLockReadGuard<'_, T> {
    rw.read().unwrap_or_else(PoisonError::into_inner)
}

fn write<T>(rw: &RwLock<T>) -> RwLockWriteGuard<'_, T> {
    rw.write().unwrap_or_else(PoisonError::into_inner)
}

/// This host's interface IPs, v4 and v6. An error gives an empty set, and the
/// peer pick in [`on_event`] falls back to the packet direction.
fn local_ips() -> HashSet<IpAddr> {
    if_addrs::get_if_addrs().map(|addrs| addrs.into_iter().map(|a| a.ip()).collect()).unwrap_or_default()
}

/// A `win:Port` field is big-endian (network order) but ferrisetw reads it as
/// a little-endian `u16`, so swap it. `0` (no port) becomes `None`.
fn host_port(raw: u16) -> Option<u16> {
    let port = raw.swap_bytes();
    (port != 0).then_some(port)
}

/// The instance a PID currently refers to.
fn current_instance(pid: u32) -> Instance {
    let generation = read(&GENERATION).get(&pid).copied().unwrap_or(0);
    instance(pid, generation)
}

/// The file name from a Kernel-Process `ImageName`, an NT device path
/// (`\Device\HarddiskVolume4\Windows\System32\svchost.exe`). It must match the
/// bare `svchost.exe` the other sources give: the tracker banks by name, so two
/// spellings would split one program into two rows.
fn image_base_name(raw: &str) -> Option<String> {
    let base = raw.rsplit(['\\', '/']).next()?.trim();
    (!base.is_empty()).then(|| base.to_owned())
}

/// Kernel-Process callback. `ProcessStart` opens a new generation for the PID
/// and records its name, so a process that lives and dies between two samples
/// is still named and a recycled PID doesn't inherit its predecessor's.
/// `ProcessStop` only marks the instance for pruning; its bytes are still owed
/// one sample.
///
/// The PID comes from the payload's `ProcessID`, not `record.process_id()`,
/// which is the process that emitted the event: the parent.
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
        lock(&ENDED).insert(current_instance(pid));
        return;
    }

    let inst = {
        let mut generations = write(&GENERATION);
        let generation = generations.entry(pid).and_modify(|g| *g += 1).or_insert(1);
        instance(pid, *generation)
    };
    let name = parser.try_parse::<String>("ImageName").ok().as_deref().and_then(image_base_name);
    write(&NAMES).insert(inst, name);
}

/// Name an instance when its first byte lands, so a process that dies before
/// the next sample still gets a label.
///
/// Only generation 0 needs it: later generations were named from
/// `ProcessStart`, and can't be looked up by bare PID anyway. That leaves
/// processes already running when the trace opened, usually long-lived, so
/// this is a backstop. A failure is tombstoned so a protected or dead PID isn't
/// reopened on every event.
fn note_instance(inst: Instance) {
    if instance_generation(inst) != 0 || read(&NAMES).contains_key(&inst) {
        return;
    }
    let name = crate::platform::app_icon::exe_path_for_pid(instance_pid(inst))
        .and_then(|path| path.file_name().map(|f| f.to_string_lossy().into_owned()));
    write(&NAMES).insert(inst, name);
}

/// Kernel-Network callback: add each send/receive to its process instance's
/// total (Apps view) and, when the event carries addresses, to its
/// connection's total (Hosts view). Event IDs are from the provider manifest:
/// 10/26 TCP send (IPv4/IPv6), 42/58 UDP send, 11/27/43/59 the receives.
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
    let Ok(pid) = parser.try_parse::<u32>("PID") else {
        return;
    };
    let Ok(size) = parser.try_parse::<u32>("size") else {
        return;
    };

    let inst = current_instance(pid);
    note_instance(inst);

    // Loopback never touches the network, and the Linux and macOS sources drop
    // it, so it counts in neither view. An event without addresses can't be
    // told apart, so it still counts toward the Apps total.
    let addrs = match (parser.try_parse::<IpAddr>("saddr"), parser.try_parse::<IpAddr>("daddr")) {
        (Ok(saddr), Ok(daddr)) => Some((saddr, daddr)),
        _ => None,
    };
    if let Some((saddr, daddr)) = addrs {
        if !is_routable_peer(saddr) || !is_routable_peer(daddr) {
            return;
        }
    }

    // Apps view.
    {
        let mut acc = lock(&ACC);
        let entry = acc.entry(inst).or_default();
        if is_rx {
            entry.rx = entry.rx.saturating_add(u64::from(size));
        }
        if is_tx {
            entry.tx = entry.tx.saturating_add(u64::from(size));
        }
    }

    // Hosts view. The peer is whichever end isn't one of this host's
    // addresses, which avoids depending on whether the provider orders
    // `saddr`/`daddr` by packet direction or by connection role. A parse miss
    // skips only this part; the Apps total above is already counted.
    let Some((saddr, daddr)) = addrs else {
        return;
    };
    let sport: u16 = parser.try_parse("sport").unwrap_or(0);
    let dport: u16 = parser.try_parse("dport").unwrap_or(0);

    let (local_ip, local_port, peer_ip, peer_port) = {
        let locals = read(&LOCAL_IPS);
        let saddr_local = locals.contains(&saddr);
        let daddr_local = locals.contains(&daddr);
        match (saddr_local, daddr_local) {
            (true, false) => (saddr, sport, daddr, dport),
            (false, true) => (daddr, dport, saddr, sport),
            // Both local: loopback or same-host traffic, not a remote host.
            (true, true) => return,
            // Neither (empty or stale local set): assume packet direction, so
            // the peer is the destination on send and the source on receive.
            (false, false) => {
                if is_tx {
                    (saddr, sport, daddr, dport)
                } else {
                    (daddr, dport, saddr, sport)
                }
            }
        }
    };

    let conn_key =
        format!("{local_ip}:{}|{peer_ip}:{}", host_port(local_port).unwrap_or(0), host_port(peer_port).unwrap_or(0));
    let mut peers = lock(&PEER_ACC);
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

/// Start the trace if it isn't running; every sample calls this until it
/// succeeds. `AlreadyExist` means an earlier Rove process's session is still
/// registered: the `UserTrace` is leaked, so it's never stopped, not even on a
/// clean exit. That isn't an elevation problem, so stop the orphan by name and
/// retry once before recording the error.
fn ensure_started() {
    if ACTIVE.load(Ordering::Acquire) {
        return;
    }
    let _guard = lock(&START_LOCK);
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

/// One attempt to open the trace. Both providers share the session: one
/// consumer thread, one privilege check, and process events interleaved with
/// the network events they name. The process provider is enabled first so its
/// `ProcessStart` events lead that traffic.
///
/// The consumer runs on its own thread (`process_from_handle` blocks), and the
/// `UserTrace` is leaked because dropping it would stop tracing.
fn try_start() -> Result<(), TraceError> {
    let processes =
        Provider::by_guid(PROCESS_PROVIDER_GUID).add_callback(on_process_event).any(KEYWORD_PROCESS).build();
    let provider = Provider::by_guid(PROVIDER_GUID).add_callback(on_event).build();
    let (trace, handle) =
        UserTrace::new().named(String::from(SESSION_NAME)).enable(processes).enable(provider).start()?;
    std::thread::spawn(move || {
        let _ = UserTrace::process_from_handle(handle);
    });
    std::mem::forget(trace);
    ACTIVE.store(true, Ordering::Release);
    *lock(&LAST_ERROR) = None;
    Ok(())
}

/// Record a start failure for the UI, leaving the session inactive so the next
/// sample retries. Usually it's missing elevation, but not always, so the exact
/// error is kept.
fn record_start_error(e: &TraceError) {
    let detail = format!("{e:?}");
    tracing::warn!("per-app ETW trace could not start: {detail}");
    *lock(&LAST_ERROR) = Some(detail);
}

/// True while the ETW session is running.
pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Acquire)
}

/// The last ETW start failure, or `None` while the session is running.
pub fn last_error() -> Option<String> {
    if ACTIVE.load(Ordering::Acquire) {
        return None;
    }
    lock(&LAST_ERROR).clone()
}

/// Last-resort naming from the process table, for instances the other sources
/// missed. Only generation 0 is eligible: a higher generation means the PID was
/// recycled, so whatever holds it now is a different program.
///
/// Skipped when everything is already named, the common case since
/// `ProcessStart` names processes as they appear; otherwise each sample would
/// walk the whole process table.
fn refresh_names(instances: &[Instance]) {
    use sysinfo::{Pid, ProcessesToUpdate, System};
    static SYS: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new()));

    let unresolved: Vec<Instance> = {
        let names = read(&NAMES);
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

    let mut sys = lock(&SYS);
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let mut names = write(&NAMES);
    for inst in unresolved {
        if let Some(proc_) = sys.process(Pid::from_u32(instance_pid(inst))) {
            names.insert(inst, Some(proc_.name().to_string_lossy().into_owned()));
        }
    }
}

/// The display name for an instance, falling back to the shared
/// [`UNRESOLVED_LABEL`] bucket.
fn label(names: &HashMap<Instance, Option<String>>, inst: Instance) -> String {
    names.get(&inst).cloned().flatten().unwrap_or_else(|| UNRESOLVED_LABEL.to_owned())
}

/// Forget exited instances, but only those in `sampled`, whose bytes have just
/// been handed to the tracker.
///
/// Dropping them after the snapshot is the point: a process that lived and
/// died between two samples would otherwise be evicted before it was counted.
/// Once reported, the tracker keeps its total when the key disappears, so
/// dropping it here only bounds the maps.
///
/// Only [`sample_units`], the reader of [`ACC`], may call this: pruning from
/// the peer path could drop bytes the Apps view never saw.
fn prune_ended(sampled: &[Instance]) {
    let done: Vec<Instance> = {
        let mut ended = lock(&ENDED);
        if ended.is_empty() {
            return;
        }
        let done: Vec<Instance> = sampled.iter().copied().filter(|inst| ended.contains(inst)).collect();
        for inst in &done {
            ended.remove(inst);
        }
        done
    };
    if done.is_empty() {
        return;
    }
    let mut acc = lock(&ACC);
    let mut names = write(&NAMES);
    for inst in &done {
        acc.remove(inst);
        names.remove(inst);
    }
}

/// Snapshot the per-instance accumulator as cumulative [`UsageUnit`]s.
pub fn sample_units() -> Vec<UsageUnit> {
    ensure_started();

    let snapshot: Vec<(Instance, ByteAcc)> = {
        let acc = lock(&ACC);
        acc.iter().map(|(&inst, &bytes)| (inst, bytes)).collect()
    };
    let instances: Vec<Instance> = snapshot.iter().map(|(inst, _)| *inst).collect();
    refresh_names(&instances);

    let units: Vec<UsageUnit> = {
        let names = read(&NAMES);
        snapshot
            .into_iter()
            .map(|(inst, bytes)| UsageUnit {
                // By instance, not PID, so a recycled PID gets a fresh
                // baseline rather than a diff against its predecessor.
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
/// Hosts view. Connections with no event since the last sample (closed or
/// idle) are pruned: the host tracker has banked their bytes, and an
/// ephemeral-port key won't recur.
pub fn sample_peer_units() -> Vec<PeerUnit> {
    ensure_started();
    *write(&LOCAL_IPS) = local_ips();

    let snapshot: Vec<(String, PeerAcc)> = {
        let mut peers = lock(&PEER_ACC);
        peers.retain(|_, e| e.touched);
        let snap: Vec<(String, PeerAcc)> = peers.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for e in peers.values_mut() {
            e.touched = false;
        }
        snap
    };
    let instances: Vec<Instance> = snapshot.iter().map(|(_, e)| e.inst).collect();
    refresh_names(&instances);

    // No `prune_ended` here; `sample_units` owns eviction (see its docs).
    let names = read(&NAMES);
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
        assert_eq!(image_base_name(r"C:\Program Files\Rove\Rove.exe").as_deref(), Some("Rove.exe"),);
        // Nothing usable rather than an empty label the UI would render blank.
        assert_eq!(image_base_name(""), None);
        assert_eq!(image_base_name(r"C:\dir\"), None);
    }

    /// The packing has to survive a PID above `i32::MAX`: Windows PIDs are
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
