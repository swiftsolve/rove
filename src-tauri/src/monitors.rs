//! The background loops: usage sampling, live-throughput broadcasting, the
//! passive device-roster refresh, and the OS network-change monitor that nudges
//! the UI off its polling interval.
use crate::AppState;
use rove_core::{live_throughput::ThroughputSampler, net_util::lock, store::Store};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};

/// How often the passive refresh tops up the device roster. A full scan is heavy
/// and noisy (ping sweep + per-host TCP probe), so the UI only scans on demand;
/// this passive pass (neighbor table + mDNS/SSDP announcements, no probing) is
/// cheap enough to run on a timer and keep `last_seen`/online state warm even
/// while the window is hidden to tray.
const PASSIVE_REFRESH_INTERVAL: Duration = Duration::from_secs(5 * 60);

/// Delay before the first passive refresh, giving the UI's initial on-open scan
/// time to seed the roster — `touch_devices` no-ops until that baseline exists.
const PASSIVE_REFRESH_WARMUP: Duration = Duration::from_secs(60);

/// Accumulate data usage into daily buckets every 30s.
pub fn spawn_usage_sampler(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Isolate a panic in the sampling path so it can never kill this
            // loop (and stop usage tracking for the rest of the session).
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let state = handle.state::<AppState>();
                let mut networks = lock(&state.networks);
                networks.refresh(true);
                let mut usage = lock(&state.usage);
                if let Some(tracker) = usage.as_mut() {
                    tracker.sample(&networks);
                }
            }));
            if outcome.is_err() {
                tracing::error!("usage sampler tick panicked; continuing");
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}

/// How often per-app usage is sampled. Shorter is more accurate — a socket that
/// opens *and* closes entirely within one interval is never observed, so its
/// bytes are missed — but each tick shells out to `ss`/`nettop`, so this trades
/// a little accuracy for a light touch. A few seconds catches all but the most
/// fleeting connections.
const APP_USAGE_INTERVAL: Duration = Duration::from_secs(4);

/// Accumulate per-app network usage every [`APP_USAGE_INTERVAL`]. Unlike the
/// interface usage sampler this reads a per-process source (`ss` on Linux,
/// `nettop` on macOS) and is async, so it lives in its own loop rather than the
/// sysinfo tick. A panic in the sampling path must not stop the loop for the
/// rest of the session, so each tick's fallible work is isolated.
pub fn spawn_app_usage_sampler(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let units = rove_core::app_usage::sample_units().await;
            {
                let state = handle.state::<AppState>();
                lock(&state.app_usage).ingest(units);
            }
            tokio::time::sleep(APP_USAGE_INTERVAL).await;
        }
    });
}

/// How often per-app remote hosts are sampled. A touch slower than the per-app
/// byte sampler: each tick may also reverse-DNS and geolocate newly-seen peers,
/// so it does more work, and the host list churns less than raw byte totals.
const HOST_USAGE_INTERVAL: Duration = Duration::from_secs(6);

/// New public peers geolocated per tick. ipwho.is is a free, rate-limited
/// service, so the newly-seen peers are metered out a handful at a time rather
/// than fired in one burst; they fill in over a few ticks as the UI polls.
const HOST_GEOIP_PER_TICK: usize = 8;

/// Sample per-app remote hosts every [`HOST_USAGE_INTERVAL`], then enrich the
/// newly-seen peers: reverse-DNS the whole batch in one process, and geolocate a
/// bounded number of public peers. Runs independently of the per-app byte
/// sampler (that one keeps its own `-P`/process-total source); this pass is the
/// peer-aware one behind the Hosts view. A panic in the sampling path must not
/// stop the loop, so each tick's fallible work is isolated per await section.
pub fn spawn_host_usage_sampler(handle: tauri::AppHandle) {
    use std::collections::HashMap;
    tauri::async_runtime::spawn(async move {
        loop {
            let readings = rove_core::host_usage::sample().await;

            // Ingest and capture what still needs resolving, dropping the lock
            // before any await (a std Mutex must never be held across .await).
            let (need_hosts, need_countries) = {
                let state = handle.state::<AppState>();
                let mut tracker = lock(&state.host_usage);
                tracker.ingest(readings);
                (tracker.pending_hostnames(), tracker.pending_countries())
            };

            // Reverse-DNS the entire new batch in a single process, then bank
            // the answers (misses cached too, so a peer is resolved once).
            if !need_hosts.is_empty() {
                let names = rove_core::devices::hostname::resolve_many(&need_hosts).await;
                let resolved: HashMap<String, Option<String>> =
                    need_hosts.into_iter().zip(names).collect();
                let state = handle.state::<AppState>();
                lock(&state.host_usage).record_hostnames(resolved);
            }

            // Geolocate a bounded slice of new public peers this tick.
            let mut countries: HashMap<String, Option<String>> = HashMap::new();
            for ip in need_countries.into_iter().take(HOST_GEOIP_PER_TICK) {
                let code = rove_core::host_usage::country_lookup(&ip).await;
                countries.insert(ip, code);
            }
            if !countries.is_empty() {
                let state = handle.state::<AppState>();
                lock(&state.host_usage).record_countries(countries);
            }

            tokio::time::sleep(HOST_USAGE_INTERVAL).await;
        }
    });
}

/// Emit live throughput at 1 Hz while the UI is subscribed.
pub fn spawn_throughput_broadcaster(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sampler = ThroughputSampler::new();
        let mut was_active = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let state = handle.state::<AppState>();
            let active = state.throughput_active.load(Ordering::Relaxed);
            if !active {
                was_active = false;
                continue;
            }
            if !was_active {
                // First tick after (re)subscribing: reset the baseline and skip
                // one emit so the idle gap isn't reported as a giant spike.
                sampler.prime();
                was_active = true;
                continue;
            }
            let sample = sampler.sample();
            let _ = handle.emit("live-throughput", &sample);
        }
    });
}

/// Keep the device roster warm in the background. Every
/// [`PASSIVE_REFRESH_INTERVAL`] this runs a no-probe presence pass (see
/// [`rove_core::devices::passive_refresh`]) — the kernel neighbor table plus
/// mDNS/SSDP announcements, no ping sweep or TCP probe — and folds the confirmed
/// devices into the store. That bumps `last_seen` and logs arrivals/returns
/// without the traffic or battery cost of a full scan, so a device seen (or a
/// return) while the app sits in the tray isn't lost by the time the user next
/// opens the Devices tab. Runs regardless of window visibility, unlike the
/// frontend's on-open scan.
///
/// Deliberately fire-and-persist with no UI event: the frontend's only device
/// fetch runs a *full active* scan, so nudging an open view to reload would
/// reintroduce the very scan-storm this passive pass exists to avoid. The warmed
/// store is read on the next natural load (tab open, resume, network change).
pub fn spawn_device_refresh(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PASSIVE_REFRESH_WARMUP).await;
        loop {
            let present = rove_core::devices::passive_refresh().await;
            let now = rove_core::net_util::now_ms() as i64;
            let store = handle.state::<Arc<Store>>();
            if let Err(e) = store.touch_devices(&present, now) {
                tracing::warn!("passive device refresh failed to persist: {e}");
            }
            tokio::time::sleep(PASSIVE_REFRESH_INTERVAL).await;
        }
    });
}

/// How often the background internet heartbeat checks public reachability. Each
/// tick is two concurrent TLS handshakes to well-known anchors plus a gateway
/// lookup (see [`rove_core::diagnostics::check_internet`]) — cheap enough to run
/// always, including while the window is hidden to tray. This is what makes an
/// internet up/down transition land on the Timeline no matter which tab is open
/// (the diagnostics poll that used to be the only source runs only on the
/// Diagnostics tab), and what keeps the top-bar connectivity label honest.
const INTERNET_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);

/// Probe public-internet reachability on a steady timer, independent of the UI.
/// Each tick caches the verdict for the top bar, folds it into the store (which
/// logs an `internet_lost` / `internet_restored` event only on a genuine
/// crossing — `record_internet` diffs its own baseline, so calling it every tick
/// is safe and idempotent), and — on a change — nudges the UI so the status bar
/// updates at once rather than on its next read. Runs regardless of window
/// visibility, so an ISP outage while Rove sits in the tray is still recorded.
pub fn spawn_internet_heartbeat(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last: Option<rove_core::types::InternetStatus> = None;
        loop {
            let status = rove_core::diagnostics::check_internet().await;
            let now = rove_core::net_util::now_ms() as i64;
            {
                let state = handle.state::<AppState>();
                *lock(&state.internet) = Some(status);
            }
            let store = handle.state::<Arc<Store>>();
            if let Err(e) = store.record_internet(status, now) {
                tracing::warn!("internet heartbeat failed to persist: {e}");
            }
            if last != Some(status) {
                let _ = handle.emit("internet-status", status);
                last = Some(status);
            }
            tokio::time::sleep(INTERNET_HEARTBEAT_INTERVAL).await;
        }
    });
}

/// How often the services heartbeat re-probes the tracked services. Slower than
/// the Services view's own 15s poll on purpose: unlike the local counters the
/// other samplers read, every tick here opens a TLS handshake and an HTTP HEAD
/// to each service — third parties who didn't ask to be health-checked — so the
/// cadence is set by what's neighbourly, not by what the UI could display. A
/// minute is ample for an outage log a human reads.
const SERVICES_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(60);

/// Delay before the first heartbeat probe. The Services view probes on open
/// anyway, and both write the same timeline, so this stays out of the way while
/// the app finds its feet rather than piling a second probe onto launch.
const SERVICES_HEARTBEAT_WARMUP: Duration = Duration::from_secs(10);

/// Probe the user's tracked services on a steady timer, independent of the UI.
///
/// This is what makes the Services timeline trustworthy: the view's own poll
/// only runs while the Services tab is open, so an outage that started while you
/// were on another tab — or with the window hidden to tray — was simply never
/// recorded. `record_services` diffs against its own per-host baseline and logs
/// only crossings, so calling it every tick is idempotent — and harmless
/// alongside the `run_services` command, which folds its own probes in too.
pub fn spawn_services_heartbeat(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SERVICES_HEARTBEAT_WARMUP).await;
        loop {
            let services = {
                let store = handle.state::<Arc<Store>>();
                store.services().unwrap_or_else(|_| rove_core::store::default_service_list())
            };
            if !services.is_empty() {
                let report = rove_core::diagnostics::run_services(&services).await;
                let now = rove_core::net_util::now_ms() as i64;
                let store = handle.state::<Arc<Store>>();
                match store.record_services(&report, now) {
                    // Nudge the timeline so an outage recorded while it's on
                    // screen lands without waiting for a remount.
                    Ok(()) => {
                        let _ = handle.emit("services-timeline", &());
                    }
                    Err(e) => tracing::warn!("services heartbeat failed to persist: {e}"),
                }
            }
            tokio::time::sleep(SERVICES_HEARTBEAT_INTERVAL).await;
        }
    });
}

/// Watch for connectivity changes and nudge the UI the moment they happen
/// (cable pulled, Wi-Fi joined) instead of waiting out its polling interval.
///
/// Linux streams kernel route events via `ip monitor route`; macOS streams the
/// routing socket via `route -n monitor`; Windows subscribes to .NET
/// `NetworkChange` notifications through a long-lived PowerShell. Each prints on
/// every change, which we debounce into a single `network-changed` event.
/// Other platforms fall back to the UI's polling interval.
pub fn spawn_route_monitor(handle: tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    tauri::async_runtime::spawn(monitor_connectivity(handle, || {
        let mut cmd = tokio::process::Command::new("ip");
        cmd.args(["monitor", "route"]);
        cmd
    }));

    // `route -n monitor` reads the PF_ROUTE socket (no privileges needed) and
    // prints a multi-line block per routing change — a cable pull or Wi-Fi hop
    // reassigns the default route, so it shows up here. The burst of lines
    // collapses to one event via the 800 ms debounce below.
    #[cfg(target_os = "macos")]
    tauri::async_runtime::spawn(monitor_connectivity(handle, || {
        let mut cmd = tokio::process::Command::new("route");
        cmd.args(["-n", "monitor"]);
        cmd
    }));

    #[cfg(target_os = "windows")]
    tauri::async_runtime::spawn(monitor_connectivity(handle, || {
        let mut cmd = tokio::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", WINDOWS_NET_MONITOR]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flash
        cmd
    }));

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    let _ = handle;
}

/// PowerShell that blocks on .NET network-change notifications and prints one
/// line per change. `NetworkAddressChanged` is the one that matters for an
/// Ethernet ↔ Wi-Fi swap (the default route's address is reassigned);
/// availability changes are folded in for good measure. Pending events are
/// drained so a burst collapses to a single line, matching the Rust-side
/// debounce below.
#[cfg(target_os = "windows")]
const WINDOWS_NET_MONITOR: &str = "\
Register-ObjectEvent -InputObject ([System.Net.NetworkInformation.NetworkChange]) -EventName NetworkAddressChanged -SourceIdentifier RoveAddr | Out-Null; \
Register-ObjectEvent -InputObject ([System.Net.NetworkInformation.NetworkChange]) -EventName NetworkAvailabilityChanged -SourceIdentifier RoveAvail | Out-Null; \
while ($true) { Wait-Event | Out-Null; Get-Event | Remove-Event; [Console]::Out.WriteLine('network-changed'); [Console]::Out.Flush() }";

/// Read change lines from a spawned monitor child, emitting a debounced
/// `network-changed` per line and respawning it (with backoff) if it dies.
#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
async fn monitor_connectivity<F>(handle: tauri::AppHandle, spawn: F)
where
    F: Fn() -> tokio::process::Command,
{
    use std::time::Duration;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut backoff = Duration::from_secs(1);
    loop {
        let spawned = {
            let mut cmd = spawn();
            cmd.stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true); // don't leave the monitor orphaned on exit
            cmd.spawn()
        };
        let Ok(mut child) = spawned else {
            tracing::warn!("could not start the network-change monitor; relying on polling");
            return;
        };
        let Some(stdout) = child.stdout.take() else {
            return;
        };

        let started = std::time::Instant::now();
        let mut lines = BufReader::new(stdout).lines();
        let mut last_emit = started - Duration::from_secs(10);

        while let Ok(Some(_)) = lines.next_line().await {
            if last_emit.elapsed() >= Duration::from_millis(800) {
                last_emit = std::time::Instant::now();
                let _ = handle.emit("network-changed", &());
            }
        }

        // The monitor exited (transient failure); reap it and respawn. One that
        // stayed up a while resets the backoff; rapid crashes escalate it
        // (capped) so we don't spin respawning.
        let _ = child.kill().await;
        if started.elapsed() >= Duration::from_secs(60) {
            backoff = Duration::from_secs(1);
        } else {
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(30));
        }
    }
}
