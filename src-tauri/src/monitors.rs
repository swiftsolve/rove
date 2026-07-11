//! The background loops: usage sampling, live-throughput broadcasting, and the
//! OS network-change monitor that nudges the UI off its polling interval.
use crate::AppState;
use rove_core::{live_throughput::ThroughputSampler, net_util::lock};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

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
