//! The Tauri command handlers: each maps 1:1 to a rove-core service.
use crate::scanner::DeviceScanner;
use crate::AppState;
use rove_core::{
    net_util::lock,
    store::{NetworkEvent, SpeedHistoryRecord, Store},
    types::*,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

/// Stringify an error for the wire: fallible commands all return
/// `Result<_, String>`, the one error shape the frontend consumes.
fn err_str(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn get_network_info(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<NetworkInfo, String> {
    tracing::info!("network info requested");
    let started = std::time::Instant::now();
    let info = rove_core::network_info::network_info().await;
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis() as u64,
        interface = ?info.interface_name,
        "network info resolved"
    );
    // Log a connection event if this machine has moved onto a new Wi-Fi/Ethernet
    // network since the last poll. Best-effort: a DB hiccup must not fail the
    // network-info read the whole UI depends on.
    let _ = store.record_connection(
        &info.connection_type,
        info.details.ssid.as_deref(),
        info.interface_name.as_deref(),
        info.ip_address.as_deref(),
        info.mac_address.as_deref(),
        rove_core::net_util::now_ms() as i64,
    );
    Ok(info)
}

#[tauri::command]
pub async fn get_wifi_share() -> Result<rove_core::wifi_share::WifiShare, String> {
    tracing::info!("wifi share requested");
    rove_core::wifi_share::current_wifi_share().await
}

#[tauri::command]
pub async fn get_interfaces() -> Vec<InterfaceSummary> {
    tracing::info!("interfaces requested");
    let started = std::time::Instant::now();
    let list = rove_core::interfaces::list().await;
    tracing::info!(
        count = list.len(),
        elapsed_ms = started.elapsed().as_millis() as u64,
        "interfaces resolved"
    );
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
    let now = rove_core::net_util::now_ms() as i64;
    let _ = store.record_devices(&scan.devices, now);
    // Merge in recently-seen devices that didn't answer this scan, so an offline
    // device stays listed (marked Offline, with a "last seen" time) instead of
    // vanishing the moment the OS ages its ARP entry out.
    if let Ok(merged) =
        store.devices_with_offline(&scan.devices, now, rove_core::store::OFFLINE_LIST_KEEP_MS)
    {
        scan.devices = merged;
    }
    Ok(scan)
}

#[tauri::command]
pub async fn run_diagnostics(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<NetworkDiagnostics, String> {
    let diag = rove_core::diagnostics::run().await;
    // Log an internet up/down transition if WAN reachability changed since the last
    // poll. Best-effort: a DB hiccup must not fail the diagnostics read.
    let _ = store.record_internet(diag.internet, rove_core::net_util::now_ms() as i64);
    Ok(diag)
}

#[tauri::command]
pub async fn run_diagnostics_live(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<rove_core::types::LiveDiagnostics, String> {
    let live = rove_core::diagnostics::run_live().await;
    // The 15s poll is where a WAN outage or recovery is normally caught; record the
    // transition so it surfaces on the Timeline. Best-effort, idempotent per poll.
    let _ = store.record_internet(live.internet, rove_core::net_util::now_ms() as i64);
    Ok(live)
}

/// Probe the user's service list — the Services view's own metric, independent
/// of the Connection diagnostics above (which no longer touch services). Bundles
/// the internet verdict from the same batch so the view can pair each result set
/// with whether this machine had internet when they were taken.
#[tauri::command]
pub async fn run_services(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<rove_core::types::ServicesReport, String> {
    // Fall back to the built-in defaults on a store read error so the list never
    // blanks over a transient DB hiccup.
    let services = store.services().unwrap_or_else(|_| rove_core::store::default_service_list());
    let report = rove_core::diagnostics::run_services(&services).await;
    let now = rove_core::net_util::now_ms() as i64;
    // The service poll also catches WAN transitions while the Services tab is open;
    // record it so the Timeline stays current here too. Best-effort, idempotent.
    let _ = store.record_internet(report.internet, now);
    // Fold this batch into the services timeline too. The heartbeat is what makes
    // the log complete (it runs with the window shut), but it only ticks each
    // minute — folding the view's own 15s poll in as well means a transition the
    // user is watching land on the list also lands on the timeline at the same
    // moment, rather than up to a minute later. `record_services` diffs against
    // its own baseline, so the two writers can't double-log a crossing.
    let _ = store.record_services(&report, now);
    Ok(report)
}

/// The services outage timeline, newest first. Recorded by the always-on
/// heartbeat (and topped up by the Services view's own poll), so it covers
/// outages that happened while the window was closed.
#[tauri::command]
pub fn get_service_history(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<Vec<rove_core::types::ServiceEvent>, String> {
    store.service_events().map_err(|e| e.to_string())
}

/// Wipe the timeline and the baseline behind it, so the next probe re-seeds from
/// scratch rather than treating a currently-down service as old news.
#[tauri::command]
pub fn clear_service_history(store: tauri::State<'_, Arc<Store>>) -> Result<(), String> {
    store.clear_service_events().map_err(|e| e.to_string())
}

/// The last public-internet reachability verdict from the background heartbeat,
/// or None before its first probe lands. A cheap cached read — it never probes;
/// [`monitors::spawn_internet_heartbeat`] owns the probing. Drives the top-bar
/// connectivity label.
#[tauri::command]
pub fn get_internet_status(
    state: tauri::State<'_, AppState>,
) -> Option<rove_core::types::InternetStatus> {
    *rove_core::net_util::lock(&state.internet)
}

#[tauri::command]
pub async fn test_service(host: String) -> Option<f64> {
    rove_core::diagnostics::probe_service(&host).await
}

#[tauri::command]
pub async fn list_services(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<Vec<rove_core::store::ServiceDef>, String> {
    store.services().map_err(err_str)
}

#[tauri::command]
pub async fn add_service(
    store: tauri::State<'_, Arc<Store>>,
    name: String,
    host: String,
) -> Result<Vec<rove_core::store::ServiceDef>, String> {
    store.add_service(&name, &host).map_err(err_str)
}

#[tauri::command]
pub async fn delete_service(
    store: tauri::State<'_, Arc<Store>>,
    host: String,
) -> Result<Vec<rove_core::store::ServiceDef>, String> {
    store.delete_service(&host).map_err(err_str)
}

#[tauri::command]
pub async fn get_public_ip() -> Option<String> {
    rove_core::network_info::public_ip().await
}

#[tauri::command]
pub async fn run_speed_test(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<SpeedTestResult, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut slot = lock(&state.speed_cancel);
        if let Some(previous) = slot.take() {
            previous.store(true, Ordering::Relaxed);
        }
        *slot = Some(cancel.clone());
    }

    let link_capacity = rove_core::network_info::network_info()
        .await
        .details
        .link_speed_mbps;

    let emitter = app.clone();
    let result = rove_core::speed::run(link_capacity, cancel.clone(), move |progress| {
        let _ = emitter.emit("speed-test-progress", &progress);
    })
    .await;

    // Clear our cancel slot unconditionally (on success, error, or cancel), but
    // only if a newer run hasn't already replaced it.
    {
        let mut slot = lock(&state.speed_cancel);
        if slot.as_ref().is_some_and(|c| Arc::ptr_eq(c, &cancel)) {
            *slot = None;
        }
    }
    result
}

#[tauri::command]
pub fn cancel_speed_test(state: tauri::State<'_, AppState>) {
    if let Some(cancel) = lock(&state.speed_cancel).take() {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn get_data_usage(state: tauri::State<'_, AppState>) -> DataUsageSummary {
    let networks = lock(&state.networks);
    lock(&state.usage)
        .as_ref()
        .map(|tracker| tracker.summary(&networks))
        .unwrap_or(DataUsageSummary {
            days: vec![],
            boot_rx_bytes: 0,
            boot_tx_bytes: 0,
            tracking_since: None,
        })
}

/// Per-app network usage since Rove started watching. A cheap in-memory read —
/// the background sampler (see `monitors::spawn_app_usage_sampler`) does the work.
#[tauri::command]
pub fn get_app_usage(state: tauri::State<'_, AppState>) -> AppUsageSummary {
    lock(&state.app_usage).summary()
}

/// Per-app remote-host breakdown for the Hosts view. A cheap in-memory read —
/// the background sampler (`monitors::spawn_host_usage_sampler`) does the
/// sampling, reverse-DNS, and geolocation.
#[tauri::command]
pub fn get_host_usage(state: tauri::State<'_, AppState>) -> HostUsageSummary {
    lock(&state.host_usage).summary()
}

#[tauri::command]
pub fn get_speed_history(
    store: tauri::State<'_, Arc<Store>>,
) -> Result<Vec<SpeedHistoryRecord>, String> {
    store.speed_history().map_err(err_str)
}

/// The network-change feed (newest first). Populated as a side effect of device
/// scans — see `get_devices`/`Store::record_devices` — so this is a cheap read.
#[tauri::command]
pub fn get_network_events(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<NetworkEvent>, String> {
    store.network_events(200).map_err(err_str)
}

#[tauri::command]
pub fn save_speed_result(
    store: tauri::State<'_, Arc<Store>>,
    entry: SpeedHistoryRecord,
) -> Result<(), String> {
    store.insert_speed(&entry).map_err(err_str)
}

/// One-time migration hook: import results the UI still had in localStorage.
#[tauri::command]
pub fn import_speed_history(
    store: tauri::State<'_, Arc<Store>>,
    entries: Vec<SpeedHistoryRecord>,
) -> Result<(), String> {
    for entry in &entries {
        store.insert_speed(entry).map_err(err_str)?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_speed_history(store: tauri::State<'_, Arc<Store>>) -> Result<(), String> {
    store.clear_speed_history().map_err(err_str)
}

#[tauri::command]
pub fn subscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.throughput_active.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn unsubscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.throughput_active.store(false, Ordering::Relaxed);
}
