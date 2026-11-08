//! The Tauri command handlers, each a thin wrapper around a rove-core service.
//! Anything that probes, shells out or hits the network is `async`, so it runs
//! off the main thread; cheap in-memory and database reads stay sync.
use crate::scanner::DeviceScanner;
use crate::AppState;
use rove_core::{
    apps::{
        hosts::{HostUsageSummary, TrafficUsageSummary},
        AppUsageSummary,
    },
    connection::NetworkInfo,
    devices::LanDeviceScan,
    diagnostics::{InternetStatus, LiveDiagnostics, NetworkDiagnostics},
    interfaces::InterfaceSummary,
    services::{ServiceEvent, ServicesReport},
    speed::SpeedTestResult,
    store::{NetworkEvent, SpeedHistoryRecord, Store},
    usage::DataUsageSummary,
    utils::net::lock,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

/// Fallible commands all return `Result<_, String>`, the one error shape the
/// UI consumes.
fn err_str(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn get_network_info(store: tauri::State<'_, Arc<Store>>) -> Result<NetworkInfo, String> {
    tracing::info!("network info requested");
    let started = std::time::Instant::now();
    let info = rove_core::connection::network_info().await;
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis() as u64,
        interface = ?info.interface_name,
        "network info resolved"
    );
    // Best-effort: a database hiccup must not fail the read the whole UI
    // depends on.
    let _ = store.record_connection(
        &info.connection_type,
        info.details.ssid.as_deref(),
        info.interface_name.as_deref(),
        info.ip_address.as_deref(),
        info.mac_address.as_deref(),
        rove_core::utils::net::now_ms() as i64,
    );
    Ok(info)
}

#[tauri::command]
pub async fn get_wifi_share() -> Result<rove_core::connection::wifi_share::WifiShare, String> {
    tracing::info!("wifi share requested");
    rove_core::connection::wifi_share::current_wifi_share().await
}

#[tauri::command]
pub async fn get_interfaces() -> Vec<InterfaceSummary> {
    tracing::info!("interfaces requested");
    let started = std::time::Instant::now();
    let list = rove_core::interfaces::list().await;
    tracing::info!(count = list.len(), elapsed_ms = started.elapsed().as_millis() as u64, "interfaces resolved");
    list
}

#[tauri::command]
pub async fn get_devices(
    store: tauri::State<'_, Arc<Store>>,
    scanner: tauri::State<'_, Arc<DeviceScanner>>,
) -> Result<LanDeviceScan, String> {
    tracing::info!("device scan started");
    let started = std::time::Instant::now();
    let mut scan = scanner.scan().await;
    tracing::info!(
        devices = scan.devices.len(),
        subnet = ?scan.subnet,
        interface = ?scan.interface_name,
        elapsed_ms = started.elapsed().as_millis() as u64,
        "device scan finished"
    );
    let now = rove_core::utils::net::now_ms() as i64;
    let _ = store.record_devices(&scan.devices, now);
    // Keep recently seen devices listed as Offline instead of vanishing when
    // the OS ages their ARP entries out.
    if let Ok(merged) = store.devices_with_offline(&scan.devices, now, rove_core::store::OFFLINE_LIST_KEEP_MS) {
        scan.devices = merged;
    }
    Ok(scan)
}

#[tauri::command]
pub async fn run_diagnostics(store: tauri::State<'_, Arc<Store>>) -> Result<NetworkDiagnostics, String> {
    let diagnostics = rove_core::diagnostics::run().await;
    // Best-effort: a database hiccup must not fail the diagnostics read.
    let _ = store.record_internet(diagnostics.internet, rove_core::utils::net::now_ms() as i64);
    Ok(diagnostics)
}

#[tauri::command]
pub async fn run_diagnostics_live(store: tauri::State<'_, Arc<Store>>) -> Result<LiveDiagnostics, String> {
    let live = rove_core::diagnostics::run_live().await;
    // The view's 15 s poll catches a WAN crossing sooner than the heartbeat.
    // Idempotent, so every poll can record.
    let _ = store.record_internet(live.internet, rove_core::utils::net::now_ms() as i64);
    Ok(live)
}

/// Probe the user's service list, with the internet verdict from the same batch
/// (see `ServicesReport`).
#[tauri::command]
pub async fn run_services(store: tauri::State<'_, Arc<Store>>) -> Result<ServicesReport, String> {
    let services = store.services().unwrap_or_else(|_| rove_core::services::default_service_list());
    let report = rove_core::services::run_services(&services).await;
    let now = rove_core::utils::net::now_ms() as i64;
    let _ = store.record_internet(report.internet, now);
    // The heartbeat keeps the log complete but ticks only each minute; folding
    // in the view's 15 s poll puts a crossing the user is watching on the
    // timeline at once. `record_services` diffs against its own baseline, so
    // the two writers can't double-log one.
    let _ = store.record_services(&report, now);
    Ok(report)
}

/// The services outage timeline, newest first. The always-on heartbeat records
/// it, so it covers outages while the window was closed.
#[tauri::command]
pub fn get_service_history(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<ServiceEvent>, String> {
    store.service_events().map_err(err_str)
}

/// Wipe the timeline and its baseline (see `Store::clear_service_events`).
#[tauri::command]
pub fn clear_service_history(store: tauri::State<'_, Arc<Store>>) -> Result<(), String> {
    store.clear_service_events().map_err(err_str)
}

/// The heartbeat's last internet status, or None before its first probe. A
/// cached read that never probes, so it's sync.
#[tauri::command]
pub fn get_internet_status(state: tauri::State<'_, AppState>) -> Option<InternetStatus> {
    *lock(&state.internet)
}

#[tauri::command]
pub async fn test_service(host: String) -> Option<f64> {
    rove_core::services::probe_service(&host).await
}

#[tauri::command]
pub async fn list_services(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<Vec<rove_core::services::ServiceDef>, String> {
    store.services().map_err(err_str)
}

#[tauri::command]
pub async fn add_service(
    store: tauri::State<'_, Arc<Store>>,
    name: String,
    host: String,
) -> Result<Vec<rove_core::services::ServiceDef>, String> {
    store.add_service(&name, &host).map_err(err_str)
}

#[tauri::command]
pub async fn update_service(
    store: tauri::State<'_, Arc<Store>>,
    old_host: String,
    name: String,
    host: String,
) -> Result<Vec<rove_core::services::ServiceDef>, String> {
    store.update_service(&old_host, &name, &host).map_err(err_str)
}

#[tauri::command]
pub async fn delete_service(
    store: tauri::State<'_, Arc<Store>>,
    host: String,
) -> Result<Vec<rove_core::services::ServiceDef>, String> {
    store.delete_service(&host).map_err(err_str)
}

#[tauri::command]
pub async fn get_public_ip() -> Option<String> {
    rove_core::connection::public_ip().await
}

#[tauri::command]
pub async fn run_speed_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    run_token: String,
) -> Result<SpeedTestResult, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut runs = lock(&state.speed_runs);
        // Stopped before it got here: don't start a test nobody wants.
        if runs.stopped_early.as_deref() == Some(run_token.as_str()) {
            runs.stopped_early = None;
            return Err(rove_core::speed::CANCELLED.into());
        }
        if let Some((_, previous)) = runs.running.take() {
            previous.store(true, Ordering::Relaxed);
        }
        runs.running = Some((run_token.clone(), cancel.clone()));
    }

    // Alongside the test, not before: network_info() takes 10 s+ on Windows with
    // a VPN and other virtual adapters, and awaiting it froze the UI at
    // "Starting speed test…". The capacity only annotates the result.
    let emitter = app.clone();
    let (info, result) = tokio::join!(
        rove_core::connection::network_info(),
        rove_core::speed::run(cancel.clone(), move |progress| {
            let _ = emitter.emit("speed-test-progress", &progress);
        }),
    );

    // Clear our slot however the run ended, unless a newer run replaced it.
    {
        let mut runs = lock(&state.speed_runs);
        if runs.running.as_ref().is_some_and(|(token, _)| *token == run_token) {
            runs.running = None;
        }
    }

    let mut result = result?;
    result.link_capacity_mbps = info.details.link_speed_mbps;
    Ok(result)
}

#[tauri::command]
pub fn cancel_speed_test(state: tauri::State<'_, AppState>, run_token: String) {
    let mut runs = lock(&state.speed_runs);
    match runs.running.take() {
        Some((token, cancel)) if token == run_token => cancel.store(true, Ordering::Relaxed),
        other => {
            // Not this run (it hasn't registered yet): put back whatever is
            // running, and stop this one when it arrives.
            runs.running = other;
            runs.stopped_early = Some(run_token);
        }
    }
}

#[tauri::command]
pub fn get_data_usage(state: tauri::State<'_, AppState>) -> DataUsageSummary {
    // Fresh counters, so today's total includes what's moved since the last
    // 30 s tick. Cheap: a read of each interface's counters.
    let mut networks = lock(&state.networks);
    networks.refresh(true);
    lock(&state.usage).as_ref().map(|tracker| tracker.summary(&networks)).unwrap_or(DataUsageSummary {
        days: vec![],
        boot_rx_bytes: 0,
        boot_tx_bytes: 0,
        tracking_since: None,
    })
}

/// Per-app network usage since Rove started watching. An in-memory read;
/// `monitors::spawn_app_usage_sampler` does the work.
#[tauri::command]
pub fn get_app_usage(state: tauri::State<'_, AppState>) -> AppUsageSummary {
    lock(&state.app_usage).summary()
}

/// Per-app remote-host breakdown for the Hosts view. An in-memory read;
/// `monitors::spawn_host_usage_sampler` does the sampling, reverse DNS and
/// geolocation.
#[tauri::command]
pub fn get_host_usage(state: tauri::State<'_, AppState>) -> HostUsageSummary {
    lock(&state.host_usage).summary()
}

/// Traffic by kind for the Traffic view: the host tracker's connections grouped
/// by service port instead of peer IP, so the two views can't disagree on
/// totals.
#[tauri::command]
pub fn get_traffic_usage(state: tauri::State<'_, AppState>) -> TrafficUsageSummary {
    lock(&state.host_usage).traffic_summary()
}

/// Why per-app usage is unavailable: on Windows the last ETW session error
/// (`None` once it's up), elsewhere always `None`. Lets the "needs
/// administrator" state show the real cause when elevation isn't the problem.
#[tauri::command]
pub fn usage_support_detail() -> Option<String> {
    rove_core::apps::support_detail()
}

/// Relaunch Rove elevated so the ETW session behind the Apps, Hosts and Traffic
/// views can open. Windows-only: `RunAs` raises the UAC prompt, then this
/// instance exits. If the user declines, nothing launches and this instance
/// stays up to show the error.
#[tauri::command]
pub async fn relaunch_as_admin(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        use rove_core::utils::shell::CREATE_NO_WINDOW;
        use std::os::windows::process::CommandExt;

        let exe = std::env::current_exe().map_err(err_str)?;
        // Single-quote the path for PowerShell, doubling any embedded quote.
        let exe = exe.to_string_lossy().replace('\'', "''");
        // A dismissed prompt is a non-terminating error (PowerShell would still
        // exit 0), so `-ErrorAction Stop` and `exit 1` are how "declined" shows.
        // On a blocking thread with no timeout: the prompt waits on the user.
        let script =
            format!("try {{ Start-Process -FilePath '{exe}' -Verb RunAs -ErrorAction Stop }} catch {{ exit 1 }}");
        let launched = tokio::task::spawn_blocking(move || {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", &script])
                .creation_flags(CREATE_NO_WINDOW)
                .status()
                .map(|s| s.success())
        })
        .await
        .map_err(err_str)?
        .map_err(err_str)?;

        if launched {
            // No single-instance guard, so the brief overlap is fine: ferrisetw
            // stops the old ETW session by name before the new one opens it.
            app.exit(0);
            Ok(())
        } else {
            Err("Elevation was declined.".to_string())
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Elevation is only supported on Windows.".to_string())
    }
}

#[tauri::command]
pub fn get_speed_history(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<SpeedHistoryRecord>, String> {
    store.speed_history().map_err(err_str)
}

/// How many of the newest network events the feed shows.
const NETWORK_EVENTS_LIMIT: i64 = 200;

/// The network-change feed, newest first. Written as a side effect of scans,
/// network-info reads and internet checks, so this is only a read.
#[tauri::command]
pub fn get_network_events(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<NetworkEvent>, String> {
    store.network_events(NETWORK_EVENTS_LIMIT).map_err(err_str)
}

#[tauri::command]
pub fn save_speed_result(store: tauri::State<'_, Arc<Store>>, entry: SpeedHistoryRecord) -> Result<(), String> {
    store.insert_speed(&entry).map_err(err_str)
}

#[tauri::command]
pub fn clear_speed_history(store: tauri::State<'_, Arc<Store>>) -> Result<(), String> {
    store.clear_speed_history().map_err(err_str)
}

#[tauri::command]
pub fn subscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.is_throughput_subscribed.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn unsubscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.is_throughput_subscribed.store(false, Ordering::Relaxed);
}
