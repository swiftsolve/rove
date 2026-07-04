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

            // Data usage: init store in app-data dir, sample every 30s.
            let store = app
                .path()
                .app_data_dir()
                .map(|dir| {
                    let _ = std::fs::create_dir_all(&dir);
                    dir.join("data-usage.json")
                })
                .unwrap_or_else(|_| std::path::PathBuf::from("data-usage.json"));
            {
                let state = app.state::<AppState>();
                *state.usage.lock().unwrap() = Some(UsageTracker::new(store));
            }

            let usage_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    {
                        let state = usage_handle.state::<AppState>();
                        let mut networks = state.networks.lock().unwrap();
                        networks.refresh(true);
                        if let Some(tracker) = state.usage.lock().unwrap().as_mut() {
                            tracker.sample(&networks);
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                }
            });

            // Live throughput: 1 Hz sampler, emitted only while subscribed.
            let throughput_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut sampler = ThroughputSampler::new();
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    let state = throughput_handle.state::<AppState>();
                    if state.throughput_subscribers.load(Ordering::Relaxed) == 0 {
                        continue;
                    }
                    let sample = sampler.sample();
                    let _ = throughput_handle.emit("live-throughput", &sample);
                }
            });

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
