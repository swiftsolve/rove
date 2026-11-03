//! The background loops: usage sampling, live throughput, the passive device
//! refresh, the internet and services heartbeats, and the OS network-change
//! monitor that nudges the UI off its polling interval. They run whether or not
//! the window is open.
use crate::AppState;
use futures_util::FutureExt;
use rove_core::{live_throughput::ThroughputSampler, store::Store, utils::net::lock};
use std::panic::AssertUnwindSafe;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};

/// How often the passive refresh tops up the device roster. A full scan is heavy
/// and noisy, so the UI scans only on demand; the passive pass (neighbour table
/// and mDNS/SSDP announcements, no probing) is cheap enough for a timer.
const PASSIVE_REFRESH_INTERVAL: Duration = Duration::from_secs(5 * 60);

/// Gives the UI's on-open scan time to seed the roster; `touch_devices` is a
/// no-op until it has.
const PASSIVE_REFRESH_WARMUP: Duration = Duration::from_secs(60);

/// How often the interface byte counters are folded into the daily totals.
const USAGE_SAMPLE_INTERVAL: Duration = Duration::from_secs(30);

/// Accumulate data usage into daily buckets every [`USAGE_SAMPLE_INTERVAL`].
pub fn spawn_usage_sampler(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            // A panic here must not end usage tracking for the session.
            let outcome = std::panic::catch_unwind(AssertUnwindSafe(|| {
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
            tokio::time::sleep(USAGE_SAMPLE_INTERVAL).await;
        }
    });
}

/// How often per-app usage is sampled. A socket that opens *and* closes within
/// one interval is never seen, but each tick shells out to `ss`/`nettop`; a few
/// seconds catches all but the most fleeting connections.
const APP_USAGE_INTERVAL: Duration = Duration::from_secs(4);

/// Accumulate per-app network usage every [`APP_USAGE_INTERVAL`]. Its own loop,
/// since it reads an async per-process source rather than the sysinfo counters.
pub fn spawn_app_usage_sampler(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let tick = async {
                // A failed sample is skipped, not ingested as an empty one: the
                // tracker would read that as every unit having vanished, drop its
                // baselines, and re-credit the world on the next good tick.
                if let Some(units) = rove_core::apps::sample_units().await {
                    let state = handle.state::<AppState>();
                    lock(&state.app_usage).ingest(units);
                }
            };
            // A panic here must not end per-app tracking for the session.
            if AssertUnwindSafe(tick).catch_unwind().await.is_err() {
                tracing::error!("app usage sampler tick panicked; continuing");
            }
            tokio::time::sleep(APP_USAGE_INTERVAL).await;
        }
    });
}

/// Slower than the per-app sampler: each tick may also reverse-resolve and
/// geolocate new peers, and the host list churns less than byte totals.
const HOST_USAGE_INTERVAL: Duration = Duration::from_secs(6);

/// Sample per-app remote hosts every [`HOST_USAGE_INTERVAL`] for the Hosts and
/// Traffic views, then enrich new peers: reverse DNS for the batch in one
/// process, and a country from the bundled table. Separate from the per-app
/// sampler, which keeps its own per-process source.
pub fn spawn_host_usage_sampler(handle: tauri::AppHandle) {
    use std::collections::HashMap;
    tauri::async_runtime::spawn(async move {
        loop {
            let tick = async {
                let sampled = rove_core::apps::hosts::sample().await;

                // Scoped so the std Mutex is released before any await.
                let (need_hosts, need_countries) = {
                    let state = handle.state::<AppState>();
                    let mut tracker = lock(&state.host_usage);
                    // A failed sample is skipped, not ingested as an empty one the
                    // tracker would read as every socket closing. Enrichment still
                    // runs on the peers already pending.
                    if let Some(readings) = sampled {
                        tracker.ingest(readings);
                    }
                    (tracker.pending_hostnames(), tracker.pending_countries())
                };

                // Misses are recorded too, so each peer resolves once.
                if !need_hosts.is_empty() {
                    let names = rove_core::devices::hostname::resolve_many(&need_hosts).await;
                    let resolved: HashMap<String, Option<String>> = need_hosts.into_iter().zip(names).collect();
                    let state = handle.state::<AppState>();
                    lock(&state.host_usage).record_hostnames(resolved);
                }

                // No per-tick cap: local table reads clear the whole backlog in one
                // pass. Blocking thread, since the first read decodes the ~8 MB
                // table.
                if !need_countries.is_empty() {
                    let resolved = tauri::async_runtime::spawn_blocking(move || {
                        need_countries
                            .into_iter()
                            .map(|ip| {
                                let code = rove_core::utils::geoip::country_code(&ip);
                                (ip, code)
                            })
                            .collect::<HashMap<String, Option<String>>>()
                    })
                    .await
                    .unwrap_or_default();
                    let state = handle.state::<AppState>();
                    lock(&state.host_usage).record_countries(resolved);
                }
            };
            // A panic here must not end host tracking for the session.
            if AssertUnwindSafe(tick).catch_unwind().await.is_err() {
                tracing::error!("host usage sampler tick panicked; continuing");
            }
            tokio::time::sleep(HOST_USAGE_INTERVAL).await;
        }
    });
}

/// The live-throughput cadence (1 Hz).
const THROUGHPUT_INTERVAL: Duration = Duration::from_secs(1);

/// Emit live throughput every [`THROUGHPUT_INTERVAL`] while the UI is subscribed.
pub fn spawn_throughput_broadcaster(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sampler = ThroughputSampler::new();
        let mut was_active = false;
        loop {
            tokio::time::sleep(THROUGHPUT_INTERVAL).await;
            let state = handle.state::<AppState>();
            let active = state.is_throughput_subscribed.load(Ordering::Relaxed);
            if !active {
                was_active = false;
                continue;
            }
            if !was_active {
                // Reset the baseline and skip one emit, so the idle gap isn't
                // reported as a giant spike.
                sampler.prime();
                was_active = true;
                continue;
            }
            let sample = sampler.sample();
            let _ = handle.emit("live-throughput", &sample);
        }
    });
}

/// Keep the device roster warm: every [`PASSIVE_REFRESH_INTERVAL`], fold a
/// no-probe presence pass ([`rove_core::devices::passive_refresh`]) into the
/// store, so arrivals and returns while Rove sits in the tray aren't lost.
///
/// No UI event on purpose: the UI's only device fetch is a *full* scan, so a
/// nudge would bring back the scan storm this pass avoids. The store is read on
/// the next natural load.
pub fn spawn_device_refresh(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PASSIVE_REFRESH_WARMUP).await;
        loop {
            let present = rove_core::devices::passive_refresh().await;
            let now = rove_core::utils::net::now_ms() as i64;
            let store = handle.state::<Arc<Store>>();
            if let Err(e) = store.touch_devices(&present, now) {
                tracing::warn!("passive device refresh failed to persist: {e}");
            }
            tokio::time::sleep(PASSIVE_REFRESH_INTERVAL).await;
        }
    });
}

/// Each tick is two TLS handshakes and a gateway lookup
/// ([`rove_core::diagnostics::check_internet`]), cheap enough to run always, so
/// a crossing lands on the Timeline whichever tab is open.
const INTERNET_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);

/// Check the internet on a steady timer: cache the status for
/// `get_internet_status`, record it (`record_internet` only logs crossings),
/// and emit `internet-status` on a change so the UI updates at once.
pub fn spawn_internet_heartbeat(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last: Option<rove_core::diagnostics::InternetStatus> = None;
        loop {
            let status = rove_core::diagnostics::check_internet().await;
            let now = rove_core::utils::net::now_ms() as i64;
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

/// Slower than the Services view's 15 s poll on purpose: every tick sends a TLS
/// handshake and a HEAD to third parties who didn't ask to be health-checked,
/// so the cadence is set by what's neighbourly. A minute is ample for an outage
/// log a human reads.
const SERVICES_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(60);

/// The Services view probes on open and writes the same timeline, so this
/// doesn't pile a second probe onto launch.
const SERVICES_HEARTBEAT_WARMUP: Duration = Duration::from_secs(10);

/// Probe the tracked services on a steady timer. The view's poll only runs
/// while its tab is open, so without this an outage on another tab or in the
/// tray would go unrecorded. `record_services` logs only crossings, so it's
/// safe alongside the `run_services` command's own writes.
pub fn spawn_services_heartbeat(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SERVICES_HEARTBEAT_WARMUP).await;
        loop {
            let services = {
                let store = handle.state::<Arc<Store>>();
                store.services().unwrap_or_else(|_| rove_core::services::default_service_list())
            };
            if !services.is_empty() {
                let report = rove_core::services::run_services(&services).await;
                let now = rove_core::utils::net::now_ms() as i64;
                let store = handle.state::<Arc<Store>>();
                match store.record_services(&report, now) {
                    // So an outage lands on a timeline already on screen.
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

/// Nudge the UI the moment connectivity changes (cable pulled, Wi-Fi joined)
/// instead of waiting out its poll.
///
/// Linux runs `ip monitor route`, macOS `route -n monitor`, and Windows a
/// long-lived PowerShell on .NET `NetworkChange`. Each prints on every change,
/// throttled into `network-changed` events. Other platforms rely on the poll.
pub fn spawn_route_monitor(handle: tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    tauri::async_runtime::spawn(monitor_connectivity(handle, || {
        let mut cmd = tokio::process::Command::new("ip");
        cmd.args(["monitor", "route"]);
        cmd
    }));

    // Reads the PF_ROUTE socket without privileges and prints a multi-line
    // block per routing change; the throttle collapses the block.
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
        cmd.creation_flags(rove_core::utils::shell::CREATE_NO_WINDOW);
        cmd
    }));

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    let _ = handle;
}

/// PowerShell that blocks on .NET network-change notifications and prints a
/// line per change. `NetworkAddressChanged` is what catches an Ethernet to Wi-Fi
/// swap; availability changes ride along. Pending events are drained so a burst
/// prints once.
#[cfg(target_os = "windows")]
const WINDOWS_NET_MONITOR: &str = "\
Register-ObjectEvent -InputObject ([System.Net.NetworkInformation.NetworkChange]) -EventName NetworkAddressChanged -SourceIdentifier RoveAddr | Out-Null; \
Register-ObjectEvent -InputObject ([System.Net.NetworkInformation.NetworkChange]) -EventName NetworkAvailabilityChanged -SourceIdentifier RoveAvail | Out-Null; \
while ($true) { Wait-Event | Out-Null; Get-Event | Remove-Event; [Console]::Out.WriteLine('network-changed'); [Console]::Out.Flush() }";

/// At most one `network-changed` per this window: one change can print several
/// lines (macOS prints a block per routing change), and the UI needs one nudge.
const NETWORK_CHANGE_THROTTLE: Duration = Duration::from_millis(800);
/// Respawn backoff for a monitor child that dies: starts here, doubles on each
/// rapid crash up to the max, and resets once a child stays up a minute.
const MONITOR_MIN_BACKOFF: Duration = Duration::from_secs(1);
const MONITOR_MAX_BACKOFF: Duration = Duration::from_secs(30);
const MONITOR_STABLE_UPTIME: Duration = Duration::from_secs(60);

/// Emit `network-changed` for a monitor child's output, at most once per
/// [`NETWORK_CHANGE_THROTTLE`], and respawn the child with backoff if it dies.
#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
async fn monitor_connectivity<F>(handle: tauri::AppHandle, spawn: F)
where
    F: Fn() -> tokio::process::Command,
{
    use std::time::Instant;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut backoff = MONITOR_MIN_BACKOFF;
    loop {
        let spawned = {
            let mut cmd = spawn();
            cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).kill_on_drop(true); // don't leave the monitor orphaned on exit
            cmd.spawn()
        };
        let Ok(mut child) = spawned else {
            tracing::warn!("could not start the network-change monitor; relying on polling");
            return;
        };
        let Some(stdout) = child.stdout.take() else {
            return;
        };

        let started = Instant::now();
        let mut lines = BufReader::new(stdout).lines();
        let mut last_emit: Option<Instant> = None;

        while let Ok(Some(_)) = lines.next_line().await {
            if last_emit.is_none_or(|at| at.elapsed() >= NETWORK_CHANGE_THROTTLE) {
                last_emit = Some(Instant::now());
                let _ = handle.emit("network-changed", &());
            }
        }

        // One that stayed up a while resets the backoff; rapid crashes escalate
        // it so we don't spin respawning.
        let _ = child.kill().await;
        if started.elapsed() >= MONITOR_STABLE_UPTIME {
            backoff = MONITOR_MIN_BACKOFF;
        } else {
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(MONITOR_MAX_BACKOFF);
        }
    }
}
