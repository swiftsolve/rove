//! Thin Tauri shell over beacon-core: each command maps 1:1 to a service.
use beacon_core::{data_usage::UsageTracker, live_throughput::ThroughputSampler, types::*};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

struct AppState {
    speed_cancel: Mutex<Option<Arc<AtomicBool>>>,
    usage: Mutex<Option<UsageTracker>>,
    networks: Mutex<sysinfo::Networks>,
    throughput_subscribers: AtomicUsize,
}

#[tauri::command]
async fn get_network_info() -> NetworkInfo {
    beacon_core::network_info::network_info().await
}

#[tauri::command]
async fn get_interfaces() -> Vec<InterfaceSummary> {
    beacon_core::interfaces::list().await
}

#[tauri::command]
async fn get_devices() -> LanDeviceScan {
    beacon_core::devices::scan().await
}

#[tauri::command]
async fn run_diagnostics() -> NetworkDiagnostics {
    beacon_core::diagnostics::run().await
}

#[tauri::command]
async fn get_public_ip() -> Option<String> {
    let out = beacon_core::shell::try_run("curl -s --max-time 5 https://api.ipify.org").await?;
    let ip = out.trim().to_string();
    (!ip.is_empty()).then_some(ip)
}

#[tauri::command]
async fn run_speed_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<SpeedTestResult, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut slot = state.speed_cancel.lock().unwrap();
        if let Some(previous) = slot.take() {
            previous.store(true, Ordering::Relaxed);
        }
        *slot = Some(cancel.clone());
    }

    let link_capacity = beacon_core::network_info::network_info()
        .await
        .details
        .link_speed_mbps;

    let emitter = app.clone();
    let result = beacon_core::speed::run(link_capacity, cancel, move |progress| {
        let _ = emitter.emit("speed-test-progress", &progress);
    })
    .await;

    if result.is_ok() {
        *state.speed_cancel.lock().unwrap() = None;
    }
    result
}

#[tauri::command]
fn cancel_speed_test(state: tauri::State<'_, AppState>) {
    if let Some(cancel) = state.speed_cancel.lock().unwrap().take() {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn get_data_usage(state: tauri::State<'_, AppState>) -> DataUsageSummary {
    let networks = state.networks.lock().unwrap();
    state
        .usage
        .lock()
        .unwrap()
        .as_ref()
        .map(|tracker| tracker.summary(&networks))
        .unwrap_or(DataUsageSummary {
            days: vec![],
            boot_rx_bytes: 0,
            boot_tx_bytes: 0,
            tracking_since: None,
        })
}

#[tauri::command]
fn subscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.throughput_subscribers.fetch_add(1, Ordering::Relaxed);
}

#[tauri::command]
fn unsubscribe_live_throughput(state: tauri::State<'_, AppState>) {
    let subscribers = &state.throughput_subscribers;
    let _ = subscribers.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
        Some(n.saturating_sub(1))
    });
}


/// Point the usage tracker at its store in the app-data directory.
fn init_usage_tracker(app: &tauri::App) {
    let store = app
        .path()
        .app_data_dir()
        .map(|dir| {
            let _ = std::fs::create_dir_all(&dir);
            dir.join("data-usage.json")
        })
        .unwrap_or_else(|_| std::path::PathBuf::from("data-usage.json"));
    let state = app.state::<AppState>();
    *state.usage.lock().unwrap() = Some(UsageTracker::new(store));
}

/// Accumulate data usage into daily buckets every 30s.
fn spawn_usage_sampler(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            {
                let state = handle.state::<AppState>();
                let mut networks = state.networks.lock().unwrap();
                networks.refresh(true);
                let mut usage = state.usage.lock().unwrap();
                if let Some(tracker) = usage.as_mut() {
                    tracker.sample(&networks);
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}

/// Emit live throughput at 1 Hz while the UI is subscribed.
fn spawn_throughput_broadcaster(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sampler = ThroughputSampler::new();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let state = handle.state::<AppState>();
            if state.throughput_subscribers.load(Ordering::Relaxed) == 0 {
                continue;
            }
            let sample = sampler.sample();
            let _ = handle.emit("live-throughput", &sample);
        }
    });
}

/// Watch the kernel routing table and nudge the UI the moment connectivity
/// changes (cable pulled, Wi-Fi joined) instead of waiting for the next poll.
/// Linux-only; other platforms rely on the UI's polling interval.
fn spawn_route_monitor(handle: tauri::AppHandle) {
    if !cfg!(target_os = "linux") {
        return;
    }
    tauri::async_runtime::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};

        let Ok(mut child) = tokio::process::Command::new("ip")
            .args(["monitor", "route"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
        else {
            return;
        };
        let Some(stdout) = child.stdout.take() else {
            return;
        };

        let mut lines = BufReader::new(stdout).lines();
        let mut last_emit = std::time::Instant::now() - std::time::Duration::from_secs(10);

        while let Ok(Some(_)) = lines.next_line().await {
            if last_emit.elapsed() >= std::time::Duration::from_millis(800) {
                last_emit = std::time::Instant::now();
                let _ = handle.emit("network-changed", &());
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            speed_cancel: Mutex::new(None),
            usage: Mutex::new(None),
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            throughput_subscribers: AtomicUsize::new(0),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            init_usage_tracker(app);
            spawn_usage_sampler(handle.clone());
            spawn_throughput_broadcaster(handle.clone());
            spawn_route_monitor(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_network_info,
            get_interfaces,
            get_devices,
            run_diagnostics,
            get_public_ip,
            run_speed_test,
            cancel_speed_test,
            get_data_usage,
            subscribe_live_throughput,
            unsubscribe_live_throughput,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beacon");
}
