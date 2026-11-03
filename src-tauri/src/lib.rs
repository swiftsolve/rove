//! Thin Tauri shell over rove-core: each command wraps one service. This file
//! is the builder wiring; the substance lives in the modules below.
mod commands;
mod logging;
mod monitors;
mod scanner;
mod store_init;
mod tray;

use rove_core::apps::hosts::HostUsageTracker;
use rove_core::apps::AppUsageTracker;
use rove_core::diagnostics::InternetStatus;
use rove_core::usage::UsageTracker;
use scanner::DeviceScanner;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// The speed test in flight, and a Stop that arrived before its run did.
///
/// The UI starts a test and may stop it before `run_speed_test` has registered
/// itself: both are separate IPC calls, and nothing orders them. So a Stop for a
/// run that isn't here yet is kept, and that run returns cancelled on arrival.
#[derive(Default)]
struct SpeedRuns {
    /// The running test's token and its cancel flag.
    running: Option<(String, Arc<AtomicBool>)>,
    /// The token of a run stopped before it started.
    stopped_early: Option<String>,
}

struct AppState {
    speed_runs: Mutex<SpeedRuns>,
    usage: Mutex<Option<UsageTracker>>,
    /// Per-app usage totals from the background sampler. In memory, so unlike
    /// `usage` it doesn't wait on the store.
    app_usage: Mutex<AppUsageTracker>,
    /// Per-app remote-host breakdown for the Hosts view, from its own sampler.
    /// In memory like `app_usage`.
    host_usage: Mutex<HostUsageTracker>,
    networks: Mutex<sysinfo::Networks>,
    /// True while any UI consumer wants 1 Hz live-throughput samples. The UI
    /// ref-counts; a bool here can't drift if subscribe and unsubscribe calls
    /// get out of step (Vite HMR, say).
    is_throughput_subscribed: AtomicBool,
    /// True once the tray icon is live. Gates close-to-tray: without a tray (a
    /// Linux desktop with no StatusNotifier host, say), closing must quit, or
    /// the user is left with an invisible, unreachable process.
    has_tray: AtomicBool,
    /// The heartbeat's latest internet status, or None before its first probe,
    /// so `get_internet_status` answers without probing.
    internet: Mutex<Option<InternetStatus>>,
}

pub fn run() {
    // Logging first, so everything below (a setup panic included) lands in the
    // log. The guard flushes on drop, so it's held until `run()` returns.
    let _log_guard = logging::init_logging();
    logging::install_panic_logger();
    tracing::info!(version = env!("CARGO_PKG_VERSION"), "Rove starting");
    #[cfg(target_os = "linux")]
    prepare_linux_desktop();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .manage(Arc::new(DeviceScanner::default()))
        .setup(setup)
        .on_window_event(on_window_event)
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
            commands::update_service,
            commands::delete_service,
            commands::get_public_ip,
            commands::run_speed_test,
            commands::cancel_speed_test,
            commands::get_data_usage,
            commands::get_app_usage,
            commands::get_host_usage,
            commands::get_traffic_usage,
            commands::usage_support_detail,
            commands::relaunch_as_admin,
            commands::get_speed_history,
            commands::get_network_events,
            commands::save_speed_result,
            commands::clear_speed_history,
            commands::subscribe_live_throughput,
            commands::unsubscribe_live_throughput,
        ])
        // Build (rather than `run`) so we can service run-loop events below.
        .build(tauri::generate_context!())
        .expect("error while running Rove")
        .run(move |_app_handle, _event| {
            // macOS: a window closed to the tray leaves the Dock icon, whose
            // click fires `Reopen` rather than creating a window. Unhandled, the
            // click does nothing and the app looks stuck.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                tray::show_main_window(_app_handle);
            }
        });
}

impl AppState {
    fn new() -> Self {
        Self {
            speed_runs: Mutex::new(SpeedRuns::default()),
            usage: Mutex::new(None),
            app_usage: Mutex::new(AppUsageTracker::new()),
            host_usage: Mutex::new(HostUsageTracker::new()),
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            is_throughput_subscribed: AtomicBool::new(false),
            has_tray: AtomicBool::new(false),
            internet: Mutex::new(None),
        }
    }
}

/// Log the Linux desktop's details and work around WebKitGTK's NVIDIA stall,
/// before the webview starts.
#[cfg(target_os = "linux")]
fn prepare_linux_desktop() {
    // The GDK backend, Wayland socket and AppArmor label (which decides whether
    // WebKit's sandboxed WebProcess can start) are behind the blank-window and
    // freeze reports, so log them to diagnose one from the log alone.
    tracing::info!(
        gdk_backend = ?std::env::var("GDK_BACKEND").ok(),
        wayland_display = ?std::env::var("WAYLAND_DISPLAY").ok(),
        session_type = ?std::env::var("XDG_SESSION_TYPE").ok(),
        apparmor = ?std::fs::read_to_string("/proc/self/attr/current")
            .ok()
            .map(|s| s.trim().to_string()),
        "linux desktop environment"
    );

    // WebKitGTK on the NVIDIA proprietary driver stalls: the accelerated
    // compositor paints one frame, then waits on a frame callback the driver
    // never delivers, so the window repaints only on input and looks hung.
    //
    // The old fix forced GDK_BACKEND=x11 and WEBKIT_DISABLE_COMPOSITING_MODE;
    // dropping both regressed NVIDIA (RTX 20-series, driver 595, WebKitGTK
    // 2.52.3, Wayland). The halves are separable: forcing x11 is what freezes
    // on 2.52, so GDK_BACKEND is left alone, and disabling the compositor is
    // what fixes NVIDIA, since repaints then flush synchronously. Respects a
    // value the user set. The non-composited path needs the opaque window
    // (`transparent: false` in tauri.conf.json).
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}

/// Open the store, start the background monitors and the tray, then show the
/// window.
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // macOS 14+ withholds the SSID without Location authorisation. Asked
    // here because CoreLocation needs the main thread; a no-op elsewhere.
    let location_status = rove_core::platform::mac_native::request_location_permission();
    tracing::info!(status = location_status, "location authorization");

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

    match tray::build_tray(&handle) {
        Ok(()) => app.state::<AppState>().has_tray.store(true, Ordering::Relaxed),
        Err(err) => {
            tracing::warn!("system tray unavailable ({err}); the window close button will quit the app")
        }
    }

    // The window is created hidden (`visible: false` in tauri.conf.json)
    // and shown here. On Linux tao maps a visible window before it drops
    // the decorations, and GTK keeps the decorated size for a
    // non-resizable window, so it came up ~52px larger each way.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
    }

    Ok(())
}

/// Closing the main window hides it to the tray when there is one.
fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" && window.app_handle().state::<AppState>().has_tray.load(Ordering::Relaxed) {
            let _ = window.hide();
            api.prevent_close();
        }
    }
}
