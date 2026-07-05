//! Thin Tauri shell over beacon-core: each command maps 1:1 to a service.
use beacon_core::{
    data_usage::UsageTracker,
    live_throughput::ThroughputSampler,
    store::{KnownDevice, SpeedHistoryRecord, Store},
    types::*,
};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

struct AppState {
    speed_cancel: Mutex<Option<Arc<AtomicBool>>>,
    usage: Mutex<Option<UsageTracker>>,
    networks: Mutex<sysinfo::Networks>,
    throughput_subscribers: AtomicUsize,
    /// True once the system tray icon is live. Gates the close-to-tray
    /// behaviour: if the tray never came up (e.g. a Linux desktop with no
    /// StatusNotifier host), closing the window must actually quit so the user
    /// isn't left with an invisible, unreachable process.
    tray_active: AtomicBool,
}

/// Lock a mutex, recovering the guard on poison instead of panicking. A single
/// panic while holding one of these locks would otherwise wedge every command
/// that touches the same state for the rest of the process's life.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
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
async fn get_devices(store: tauri::State<'_, Arc<Store>>) -> Result<LanDeviceScan, ()> {
    let scan = beacon_core::devices::scan().await;
    let _ = store.record_devices(&scan.devices, beacon_core::net_util::now_ms() as i64);
    Ok(scan)
}

#[tauri::command]
async fn run_diagnostics() -> NetworkDiagnostics {
    beacon_core::diagnostics::run().await
}

#[tauri::command]
async fn get_public_ip() -> Option<String> {
    beacon_core::network_info::public_ip().await
}

#[tauri::command]
async fn run_speed_test(
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

    let link_capacity = beacon_core::network_info::network_info()
        .await
        .details
        .link_speed_mbps;

    let emitter = app.clone();
    let result = beacon_core::speed::run(link_capacity, cancel.clone(), move |progress| {
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
fn cancel_speed_test(state: tauri::State<'_, AppState>) {
    if let Some(cancel) = lock(&state.speed_cancel).take() {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn get_data_usage(state: tauri::State<'_, AppState>) -> DataUsageSummary {
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

#[tauri::command]
fn get_speed_history(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<SpeedHistoryRecord>, String> {
    store.speed_history().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_speed_result(
    store: tauri::State<'_, Arc<Store>>,
    entry: SpeedHistoryRecord,
) -> Result<(), String> {
    store.insert_speed(&entry).map_err(|e| e.to_string())
}

/// One-time migration hook: import results the UI still had in localStorage.
#[tauri::command]
fn import_speed_history(
    store: tauri::State<'_, Arc<Store>>,
    entries: Vec<SpeedHistoryRecord>,
) -> Result<(), String> {
    for entry in &entries {
        store.insert_speed(entry).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn clear_speed_history(store: tauri::State<'_, Arc<Store>>) -> Result<(), String> {
    store.clear_speed_history().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_known_devices(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<KnownDevice>, String> {
    store.known_devices().map_err(|e| e.to_string())
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

/// Popover "Open Beacon": surface the main window and dismiss the popover.
#[tauri::command]
fn open_main_window(app: tauri::AppHandle) {
    show_main_window(&app);
    if let Some(popover) = app.get_webview_window("popover") {
        let _ = popover.close();
    }
}

/// Popover "Quit": exit the process for real (the only true way out once the
/// window close button hides to tray).
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// TEMP DIAGNOSTIC: surface frontend errors in the dev terminal.
#[tauri::command]
fn __diag(msg: String) {
    eprintln!("Beacon[js]: {msg}");
}


/// Open the SQLite store in the app-data dir, importing any usage history left
/// behind by the previous JSON-file format, and point the usage tracker at it.
fn init_store(app: &tauri::App) {
    let data_dir = app
        .path()
        .app_data_dir()
        .map(|dir| {
            let _ = std::fs::create_dir_all(&dir);
            dir
        })
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let store = match Store::open(&data_dir.join("beacon.db")) {
        Ok(store) => Arc::new(store),
        Err(err) => {
            eprintln!("Beacon: failed to open database: {err}");
            return;
        }
    };

    import_legacy_usage(&store, &data_dir.join("data-usage.json"));

    let state = app.state::<AppState>();
    *lock(&state.usage) = Some(UsageTracker::new(store.clone()));
    app.manage(store);
}

/// Fold the old `data-usage.json` daily buckets into the database once, then
/// leave the file in place (harmless) so a downgrade could still read it.
fn import_legacy_usage(store: &Store, json_path: &std::path::Path) {
    if !store.usage_is_empty().unwrap_or(true) {
        return; // already have usage rows — nothing to import.
    }

    #[derive(serde::Deserialize)]
    struct LegacyBucket {
        rx: u64,
        tx: u64,
    }
    #[derive(serde::Deserialize)]
    struct LegacyUsage {
        #[serde(default)]
        days: std::collections::HashMap<String, LegacyBucket>,
        first_sample_at: Option<u64>,
    }

    let Some(legacy) = std::fs::read_to_string(json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<LegacyUsage>(&raw).ok())
    else {
        return;
    };

    for (date, bucket) in &legacy.days {
        let _ = store.add_usage(date, bucket.rx, bucket.tx);
    }
    if let Some(first) = legacy.first_sample_at {
        let _ = store.set_meta_u64("usage_first_sample_at", first);
    }
}

/// Accumulate data usage into daily buckets every 30s.
fn spawn_usage_sampler(handle: tauri::AppHandle) {
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
                eprintln!("Beacon: usage sampler tick panicked; continuing");
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}

/// Emit live throughput at 1 Hz while the UI is subscribed.
fn spawn_throughput_broadcaster(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut sampler = ThroughputSampler::new();
        let mut was_active = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let state = handle.state::<AppState>();
            let active = state.throughput_subscribers.load(Ordering::Relaxed) > 0;
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

/// Watch the kernel routing table and nudge the UI the moment connectivity
/// changes (cable pulled, Wi-Fi joined) instead of waiting for the next poll.
/// Linux-only; other platforms rely on the UI's polling interval.
fn spawn_route_monitor(handle: tauri::AppHandle) {
    if !cfg!(target_os = "linux") {
        return;
    }
    tauri::async_runtime::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        use std::time::Duration;

        let mut backoff = Duration::from_secs(1);
        loop {
            let spawned = tokio::process::Command::new("ip")
                .args(["monitor", "route"])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true) // don't leave `ip monitor` orphaned on exit
                .spawn();
            let Ok(mut child) = spawned else {
                eprintln!("Beacon: could not start `ip monitor route`; relying on polling");
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

            // The monitor exited (transient failure); reap it and respawn. A
            // monitor that stayed up a while resets the backoff; rapid crashes
            // escalate it (capped) so we don't spin respawning.
            let _ = child.kill().await;
            if started.elapsed() >= Duration::from_secs(60) {
                backoff = Duration::from_secs(1);
            } else {
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(30));
            }
        }
    });
}

/// Reveal the main window and pull it to the foreground.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Build the system tray icon and its menu. The menu (Open / Quit) is the whole
/// interaction: it's a native menu, so it renders identically and reliably on
/// Windows, macOS and every Linux desktop — no custom webview panel to paint.
/// Returns an error if the platform can't host a tray, letting the caller fall
/// back to quit-on-close.
fn build_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open Beacon", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Beacon", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("no default window icon to use for the tray")?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Beacon")
        .menu(&menu)
        // Show the menu on a left-click too (not just right-click), so a single
        // click always surfaces Open / Quit on every platform.
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            speed_cancel: Mutex::new(None),
            usage: Mutex::new(None),
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            throughput_subscribers: AtomicUsize::new(0),
            tray_active: AtomicBool::new(false),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            init_store(app);
            spawn_usage_sampler(handle.clone());
            spawn_throughput_broadcaster(handle.clone());
            spawn_route_monitor(handle.clone());

            // If the tray comes up, closing the window will hide to tray;
            // otherwise we leave close-to-quit intact so the app stays reachable.
            match build_tray(&handle) {
                Ok(()) => app.state::<AppState>().tray_active.store(true, Ordering::Relaxed),
                Err(err) => eprintln!(
                    "Beacon: system tray unavailable ({err}); the window close button will quit the app"
                ),
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Main window's close button hides to tray (when the tray is live)
            // instead of quitting the app.
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                let app = window.app_handle();
                if app.state::<AppState>().tray_active.load(Ordering::Relaxed) {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
            // The popover is a transient panel: dismiss it as soon as it loses
            // focus (click elsewhere, switch apps), like a native menu. Closing
            // (not hiding) means the next open builds a fresh, properly-painted
            // webview — hidden-then-reshown webviews render blank on Wayland.
            tauri::WindowEvent::Focused(false) if window.label() == "popover" => {
                let _ = window.close();
            }
            _ => {}
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
            get_speed_history,
            save_speed_result,
            import_speed_history,
            clear_speed_history,
            get_known_devices,
            subscribe_live_throughput,
            unsubscribe_live_throughput,
            open_main_window,
            quit_app,
            __diag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beacon");
}
