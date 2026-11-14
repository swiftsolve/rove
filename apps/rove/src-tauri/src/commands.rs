//! The Tauri command handlers, each a thin wrapper around a rove-core service.
//! Tauri runs a sync command on the main thread, so only cheap in-memory reads
//! are sync. Anything that probes, shells out or hits the network is `async`,
//! and store calls go through `Store::run_blocking` so disk I/O stays off the
//! async workers too.
use crate::error::{log_if_failed, CommandError, CommandResult};
use crate::scanner::DeviceScanner;
use crate::ui_events::emit_to_ui;
use crate::AppState;
use rove_core::{
    apps::{
        hosts::{HostUsageSummary, TrafficUsageSummary},
        AppUsageSummary,
    },
    connection::network_key,
    connection::NetworkInfo,
    devices::LanDeviceScan,
    diagnostics::{InternetStatus, LiveDiagnostics, NetworkDiagnostics},
    interfaces::InterfaceSummary,
    services::ServiceDef,
    services::{ServiceEvent, ServicesReport},
    speed::{SpeedTestError, SpeedTestResult},
    store::{NetworkEvent, SpeedHistoryRecord, Store, OFFLINE_LIST_KEEP_MS},
    usage::DataUsageSummary,
    utils::net::{lock, now_ms},
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

/// The user's service list, or the defaults if the store can't be read.
async fn services_or_defaults(store: &Arc<Store>) -> Vec<ServiceDef> {
    store.run_blocking(Store::services).await.unwrap_or_else(|e| {
        tracing::warn!("could not read the service list, probing the defaults: {e}");
        rove_core::services::default_service_list()
    })
}

/// Record an internet check on the outage timeline, best-effort.
async fn record_internet(store: &Arc<Store>, internet: InternetStatus) {
    let now = now_ms();
    let recorded = store.run_blocking(move |store| store.record_internet(internet, now)).await;
    log_if_failed("record the internet status", recorded);
}

#[tauri::command]
pub async fn get_network_info(store: tauri::State<'_, Arc<Store>>) -> CommandResult<NetworkInfo> {
    tracing::info!("network info requested");
    let started = std::time::Instant::now();
    let info = rove_core::connection::network_info().await;
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis(),
        interface = ?info.interface_name,
        "network info resolved"
    );
    // Best-effort: a database hiccup must not fail the read the whole UI
    // depends on.
    let connection = info.clone();
    let now = now_ms();
    let recorded = store
        .run_blocking(move |store| {
            store.record_connection(
                &connection.connection_type,
                connection.details.ssid.as_deref(),
                connection.interface_name.as_deref(),
                connection.ip_address.as_deref(),
                connection.mac_address.as_deref().and_then(|mac| mac.parse().ok()),
                now,
            )
        })
        .await;
    log_if_failed("record the connection", recorded);
    Ok(info)
}

#[tauri::command]
pub async fn get_wifi_share() -> CommandResult<rove_core::connection::wifi_share::WifiShare> {
    tracing::info!("wifi share requested");
    Ok(rove_core::connection::wifi_share::current_wifi_share().await?)
}

#[tauri::command]
pub async fn get_interfaces() -> Vec<InterfaceSummary> {
    tracing::info!("interfaces requested");
    let started = std::time::Instant::now();
    let list = rove_core::interfaces::list().await;
    tracing::info!(count = list.len(), elapsed_ms = started.elapsed().as_millis(), "interfaces resolved");
    list
}

#[tauri::command]
pub async fn get_devices(
    store: tauri::State<'_, Arc<Store>>,
    scanner: tauri::State<'_, Arc<DeviceScanner>>,
) -> CommandResult<LanDeviceScan> {
    tracing::info!("device scan started");
    let started = std::time::Instant::now();
    let mut scan = scanner.scan().await;
    tracing::info!(
        devices = scan.devices.len(),
        subnet = ?scan.subnet,
        interface = ?scan.interface_name,
        elapsed_ms = started.elapsed().as_millis(),
        "device scan finished"
    );
    let now = now_ms();
    let scanned = std::mem::take(&mut scan.devices);
    scan.devices = store
        .run_blocking(move |store| {
            log_if_failed("record the scanned devices", store.record_devices(&scanned, now));
            // Keep recently seen devices listed as Offline instead of vanishing
            // when the OS ages their ARP entries out.
            match store.devices_with_offline(&scanned, now, OFFLINE_LIST_KEEP_MS) {
                Ok(with_offline) => with_offline,
                Err(e) => {
                    tracing::warn!("could not merge offline devices into the scan: {e}");
                    scanned
                }
            }
        })
        .await;
    Ok(scan)
}

#[tauri::command]
pub async fn run_diagnostics(store: tauri::State<'_, Arc<Store>>) -> CommandResult<NetworkDiagnostics> {
    let diagnostics = rove_core::diagnostics::run().await;
    // Best-effort: a database hiccup must not fail the diagnostics read.
    record_internet(&store, diagnostics.internet).await;
    Ok(diagnostics)
}

#[tauri::command]
pub async fn run_diagnostics_live(store: tauri::State<'_, Arc<Store>>) -> CommandResult<LiveDiagnostics> {
    let live = rove_core::diagnostics::run_live().await;
    // The view's 15 s poll catches a WAN crossing sooner than the heartbeat.
    // Idempotent, so every poll can record.
    record_internet(&store, live.internet).await;
    Ok(live)
}

/// Probe the user's service list, with the internet verdict from the same batch
/// (see `ServicesReport`).
#[tauri::command]
pub async fn run_services(
    store: tauri::State<'_, Arc<Store>>,
    state: tauri::State<'_, AppState>,
) -> CommandResult<ServicesReport> {
    let services = services_or_defaults(&store).await;
    let (report, network_key) = tokio::join!(rove_core::services::run_services(&services), network_key());
    state.remember_services_report(network_key, &report);
    record_internet(&store, report.internet).await;
    // The heartbeat keeps the log complete but ticks only each minute; folding
    // in the view's 15 s poll puts a crossing the user is watching on the
    // timeline at once. `record_services` diffs against its own baseline, so
    // the two writers can't double-log one.
    let now = now_ms();
    let to_record = report.clone();
    let recorded = store.run_blocking(move |store| store.record_services(&to_record, now)).await;
    log_if_failed("record the services report", recorded);
    Ok(report)
}

/// The last services probe batch, the heartbeat's or the view's, when it was
/// measured on `network_key`, so the Services view opens on it while its own
/// probe runs. A cached read that never probes, so it's sync.
#[tauri::command]
pub fn get_last_services_report(state: tauri::State<'_, AppState>, network_key: String) -> Option<ServicesReport> {
    lock(&state.last_services_report).as_ref().and_then(|last| last.report_on(&network_key)).cloned()
}

/// The services outage timeline, newest first. The always-on heartbeat records
/// it, so it covers outages while the window was closed.
#[tauri::command]
pub async fn get_service_history(store: tauri::State<'_, Arc<Store>>) -> CommandResult<Vec<ServiceEvent>> {
    Ok(store.run_blocking(Store::service_events).await?)
}

/// Wipe the timeline and its baseline (see `Store::clear_service_events`).
#[tauri::command]
pub async fn clear_service_history(store: tauri::State<'_, Arc<Store>>) -> CommandResult<()> {
    Ok(store.run_blocking(Store::clear_service_events).await?)
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
pub async fn list_services(store: tauri::State<'_, Arc<Store>>) -> CommandResult<Vec<ServiceDef>> {
    Ok(store.run_blocking(Store::services).await?)
}

#[tauri::command]
pub async fn add_service(
    store: tauri::State<'_, Arc<Store>>,
    name: String,
    host: String,
) -> CommandResult<Vec<ServiceDef>> {
    Ok(store.run_blocking(move |store| store.add_service(&name, &host)).await?)
}

#[tauri::command]
pub async fn update_service(
    store: tauri::State<'_, Arc<Store>>,
    old_host: String,
    name: String,
    host: String,
) -> CommandResult<Vec<ServiceDef>> {
    Ok(store.run_blocking(move |store| store.update_service(&old_host, &name, &host)).await?)
}

#[tauri::command]
pub async fn delete_service(store: tauri::State<'_, Arc<Store>>, host: String) -> CommandResult<Vec<ServiceDef>> {
    Ok(store.run_blocking(move |store| store.delete_service(&host)).await?)
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
) -> CommandResult<SpeedTestResult> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut runs = lock(&state.speed_runs);
        // Stopped before it got here: don't start a test nobody wants.
        if runs.stopped_early.as_deref() == Some(run_token.as_str()) {
            runs.stopped_early = None;
            return Err(SpeedTestError::Cancelled.into());
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
            emit_to_ui(&emitter, "speed-test-progress", &progress);
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

/// Async, on the blocking pool: the summary reads the daily buckets from the
/// store.
#[tauri::command]
pub async fn get_data_usage(app: tauri::AppHandle) -> DataUsageSummary {
    let summary = tokio::task::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Fresh counters, so today's total includes what's moved since the
        // last 30 s tick. Cheap: a read of each interface's counters.
        let mut networks = lock(&state.networks);
        networks.refresh(true);
        let usage = lock(&state.usage);
        usage.as_ref().map(|tracker| tracker.summary(&networks))
    })
    .await;
    match summary {
        Ok(Some(summary)) => summary,
        // No store, so no tracker.
        Ok(None) => DataUsageSummary { days: vec![], boot_rx_bytes: 0, boot_tx_bytes: 0, tracking_since: None },
        Err(join_error) => std::panic::resume_unwind(join_error.into_panic()),
    }
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
pub async fn relaunch_as_admin(app: tauri::AppHandle) -> CommandResult<()> {
    #[cfg(windows)]
    {
        use rove_core::utils::shell::CREATE_NO_WINDOW;
        use std::os::windows::process::CommandExt;

        let exe = std::env::current_exe()?;
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
                .map(|status| status.success())
        })
        .await
        .map_err(std::io::Error::other)??;

        if launched {
            // No single-instance guard, so the brief overlap is fine: ferrisetw
            // stops the old ETW session by name before the new one opens it.
            app.exit(0);
            Ok(())
        } else {
            Err(CommandError::ElevationDeclined)
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(CommandError::ElevationUnsupported)
    }
}

#[tauri::command]
pub async fn get_speed_history(store: tauri::State<'_, Arc<Store>>) -> CommandResult<Vec<SpeedHistoryRecord>> {
    Ok(store.run_blocking(Store::speed_history).await?)
}

/// How many of the newest network events the feed shows.
const NETWORK_EVENTS_LIMIT: i64 = 200;

/// The network-change feed, newest first. Written as a side effect of scans,
/// network-info reads and internet checks, so this is only a read.
#[tauri::command]
pub async fn get_network_events(store: tauri::State<'_, Arc<Store>>) -> CommandResult<Vec<NetworkEvent>> {
    Ok(store.run_blocking(|store| store.network_events(NETWORK_EVENTS_LIMIT)).await?)
}

#[tauri::command]
pub async fn save_speed_result(store: tauri::State<'_, Arc<Store>>, entry: SpeedHistoryRecord) -> CommandResult<()> {
    Ok(store.run_blocking(move |store| store.insert_speed(&entry)).await?)
}

#[tauri::command]
pub async fn clear_speed_history(store: tauri::State<'_, Arc<Store>>) -> CommandResult<()> {
    Ok(store.run_blocking(Store::clear_speed_history).await?)
}

#[tauri::command]
pub fn subscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.is_throughput_subscribed.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn unsubscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.is_throughput_subscribed.store(false, Ordering::Relaxed);
}
