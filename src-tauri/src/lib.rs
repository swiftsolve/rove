//! Thin Tauri shell over rove-core: each command maps 1:1 to a service.
//! This file is the builder wiring; the substance lives in the modules below.
mod commands;
mod logging;
mod monitors;
mod scanner;
mod store_init;
mod tray;

use rove_core::app_usage::AppUsageTracker;
use rove_core::data_usage::UsageTracker;
use rove_core::host_usage::HostUsageTracker;
use rove_core::types::InternetStatus;
use scanner::DeviceScanner;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Manager;

struct AppState {
    speed_cancel: Mutex<Option<Arc<AtomicBool>>>,
    usage: Mutex<Option<UsageTracker>>,
    /// Per-app usage totals, fed by the background app-usage sampler. Always
    /// present (unlike `usage`, which waits on the store) — the tracker is pure
    /// in-memory state, so it needs no initialization.
    app_usage: Mutex<AppUsageTracker>,
    /// Per-app remote-host breakdown for the Hosts view, fed by its own
    /// background sampler + enrichment loop. In-memory like `app_usage`.
    host_usage: Mutex<HostUsageTracker>,
    networks: Mutex<sysinfo::Networks>,
    /// True while any UI consumer wants 1 Hz live-throughput samples. The
    /// frontend ref-counts and toggles this; a bool avoids counter drift if
    /// subscribe/unsubscribe calls ever get out of sync (e.g. Vite HMR).
    throughput_active: AtomicBool,
    /// True once the system tray icon is live. Gates the close-to-tray
    /// behaviour: if the tray never came up (e.g. a Linux desktop with no
    /// StatusNotifier host), closing the window must actually quit so the user
    /// isn't left with an invisible, unreachable process.
    tray_active: AtomicBool,
    /// Latest public-internet reachability from the background heartbeat, or
    /// None before the first probe lands. The top bar reads this cheaply; the
    /// heartbeat owns the probing and the Timeline logging.
    internet: Mutex<Option<InternetStatus>>,
}

pub fn run() {
    // File logging first, so everything below — including a panic during setup —
    // lands in the log. The guard flushes on drop, so it must outlive the app;
    // hold it until `run()` returns.
    let _log_guard = logging::init_logging();
    logging::install_panic_logger();
    tracing::info!(version = env!("CARGO_PKG_VERSION"), "Rove starting");
    // Capture the desktop/render environment up front: this is exactly the
    // context (GDK backend, Wayland socket, and the AppArmor label that governs
    // whether WebKit's sandboxed WebProcess can start) that has caused the
    // blank-window / freeze issues, so a future report can be diagnosed from the
    // log alone.
    #[cfg(target_os = "linux")]
    tracing::info!(
        gdk_backend = ?std::env::var("GDK_BACKEND").ok(),
        wayland_display = ?std::env::var("WAYLAND_DISPLAY").ok(),
        session_type = ?std::env::var("XDG_SESSION_TYPE").ok(),
        apparmor = ?std::fs::read_to_string("/proc/self/attr/current")
            .ok()
            .map(|s| s.trim().to_string()),
        "linux desktop environment"
    );

    // WebKitGTK + the NVIDIA proprietary driver have a long history of render
    // stalls: the webview's accelerated compositor paints one frame then waits on
    // a frame callback the NVIDIA driver never delivers, so it only repaints on
    // input and an async network scan finishing never reaches the screen — the
    // window looks hung even though the Rust backend keeps running.
    //
    // The old workaround forced GDK_BACKEND=x11 *and* WEBKIT_DISABLE_COMPOSITING_MODE
    // together, then a later change dropped both — on the theory WebKitGTK 2.52
    // renders fine on native Wayland. That holds on many stacks but NOT on NVIDIA:
    // there the compositor stall is back (reproduced on RTX 20-series, driver 595,
    // WebKitGTK 2.52.3, Wayland session), so removing the workaround wholesale
    // regressed those machines.
    //
    // The two halves are separable. Forcing x11/XWayland is the half that freezes
    // on 2.52, so we do NOT touch GDK_BACKEND — GTK picks the session-native
    // backend, which is what works. Disabling the accelerated compositor is the
    // half that fixes NVIDIA: repaints then flush synchronously, sidestepping the
    // never-delivered frame callback, at a small cost to GPU-composited effects we
    // don't use. So on Linux we set only WEBKIT_DISABLE_COMPOSITING_MODE (unless
    // the user already set it), and leave the backend alone. The window is opaque
    // (`transparent: false` in tauri.conf.json), which the non-composited path
    // relies on and which is harmless here.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            speed_cancel: Mutex::new(None),
            usage: Mutex::new(None),
            app_usage: Mutex::new(AppUsageTracker::new()),
            host_usage: Mutex::new(HostUsageTracker::new()),
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            throughput_active: AtomicBool::new(false),
            tray_active: AtomicBool::new(false),
            internet: Mutex::new(None),
        })
        .manage(Arc::new(DeviceScanner::default()))
        .setup(|app| {
            // macOS 14+ withholds the Wi-Fi SSID unless the app holds Location
            // authorization; prompt once at startup. No-op on other platforms,
            // and this runs on the main thread as CoreLocation requires.
            let loc_status = rove_core::platform::mac_native::request_location_permission();
            tracing::info!(status = loc_status, "location authorization");

            let handle = app.handle().clone();
            store_init::init_store(app);
            monitors::spawn_usage_sampler(handle.clone());
            monitors::spawn_app_usage_sampler(handle.clone());
            monitors::spawn_host_usage_sampler(handle.clone());
            monitors::spawn_throughput_broadcaster(handle.clone());
            monitors::spawn_device_refresh(handle.clone());
            monitors::spawn_route_monitor(handle.clone());
            monitors::spawn_internet_heartbeat(handle.clone());
            monitors::spawn_services_heartbeat(handle.clone());

            // If the tray comes up, closing the window will hide to tray;
            // otherwise we leave close-to-quit intact so the app stays reachable.
            match tray::build_tray(&handle) {
                Ok(()) => app.state::<AppState>().tray_active.store(true, Ordering::Relaxed),
                Err(err) => tracing::warn!(
                    "system tray unavailable ({err}); the window close button will quit the app"
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
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_network_info,
            commands::get_wifi_share,
            commands::get_interfaces,
            commands::get_devices,
            commands::run_diagnostics,
            commands::run_diagnostics_live,
            commands::run_services,
            commands::get_service_history,
            commands::clear_service_history,
            commands::get_internet_status,
            commands::test_service,
            commands::list_services,
            commands::add_service,
            commands::delete_service,
            commands::get_public_ip,
            commands::run_speed_test,
            commands::cancel_speed_test,
            commands::get_data_usage,
            commands::get_app_usage,
            commands::get_host_usage,
            commands::get_traffic_usage,
            commands::get_speed_history,
            commands::get_network_events,
            commands::save_speed_result,
            commands::import_speed_history,
            commands::clear_speed_history,
            commands::subscribe_live_throughput,
            commands::unsubscribe_live_throughput,
        ])
        // Build (rather than `run`) so we can service run-loop events below.
        .build(tauri::generate_context!())
        .expect("error while running Rove")
        .run(move |_app_handle, _event| {
            // macOS: once the window is closed to the tray it's hidden but the
            // Dock icon stays. Clicking it fires `Reopen` (with no visible
            // windows) rather than creating a window — without this handler the
            // click does nothing and the app looks stuck. Bring it back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                tray::show_main_window(_app_handle);
            }
        });
}
