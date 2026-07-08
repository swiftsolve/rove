//! Thin Tauri shell over rove-core: each command maps 1:1 to a service.
use rove_core::{
    data_usage::UsageTracker,
    live_throughput::ThroughputSampler,
    store::{KnownDevice, SpeedHistoryRecord, Store},
    types::*,
};
use futures_util::future::FutureExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

struct AppState {
    speed_cancel: Mutex<Option<Arc<AtomicBool>>>,
    usage: Mutex<Option<UsageTracker>>,
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
}

/// Lock a mutex, recovering the guard on poison instead of panicking. A single
/// panic while holding one of these locks would otherwise wedge every command
/// that touches the same state for the rest of the process's life.
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

type SharedScan =
    futures_util::future::Shared<std::pin::Pin<Box<dyn std::future::Future<Output = LanDeviceScan> + Send>>>;

/// Hard ceiling on a single LAN scan. A healthy scan takes ~6s, so this sits
/// well above the normal case, yet low enough that a wedged probe or a host that
/// stalls an enrichment round can't tie up device polling for minutes.
/// Overlapping scans — the usual cause of runaway times — are already prevented
/// by the dedupe guard below; this is the backstop for everything else.
const SCAN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Coalesces concurrent LAN scans. Each `scan()` probes the subnet with up to
/// 64 concurrent `ping` subprocesses; if the frontend's 45s poll (plus
/// `onNetworkChanged` nudges during Wi-Fi roaming) fires a new request while a
/// slow scan is still running, launching a *second* scan doubles that
/// subprocess load and starves the tokio runtime — which is what made
/// `get_network_info` time out. This guard makes overlapping callers await the
/// single in-flight scan instead of starting their own.
#[derive(Default)]
struct DeviceScanner {
    /// The in-flight scan (a cheaply-cloneable `Shared` future) tagged with a
    /// generation id, or `None` when idle. The id lets the caller that started
    /// a scan clear the slot on completion *without* clobbering a newer scan
    /// that a later caller may have installed in the meantime.
    inflight: tokio::sync::Mutex<Option<(u64, SharedScan)>>,
    next_id: std::sync::atomic::AtomicU64,
}

impl DeviceScanner {
    /// Run a scan, or join the one already in flight. Sequential (non-overlapping)
    /// calls each get a fresh scan; overlapping calls all resolve to the same result.
    /// The scan is bounded by `SCAN_TIMEOUT`; on expiry it yields an empty result
    /// rather than letting a wedged probe run unbounded.
    async fn scan(&self) -> LanDeviceScan {
        self.scan_with(|| {
            Box::pin(async {
                match tokio::time::timeout(SCAN_TIMEOUT, rove_core::devices::scan()).await {
                    Ok(scan) => scan,
                    Err(_) => {
                        tracing::warn!(
                            timeout_s = SCAN_TIMEOUT.as_secs(),
                            "device scan exceeded its time budget; returning empty result"
                        );
                        LanDeviceScan {
                            devices: Vec::new(),
                            subnet: None,
                            interface_name: None,
                            scanned_at: rove_core::net_util::now_ms(),
                            dhcp_status: "unavailable",
                        }
                    }
                }
            })
        })
        .await
    }

    /// The dedupe machinery, parameterised over the scan producer so tests can
    /// substitute a counted stub for the real (subprocess-heavy) `scan()`. The
    /// producer runs only when no scan is in flight.
    async fn scan_with<F>(&self, produce: F) -> LanDeviceScan
    where
        F: FnOnce() -> std::pin::Pin<Box<dyn std::future::Future<Output = LanDeviceScan> + Send>>,
    {
        let (id, fut) = {
            let mut guard = self.inflight.lock().await;
            if let Some((id, fut)) = guard.as_ref() {
                (*id, fut.clone())
            } else {
                let id = self.next_id.fetch_add(1, Ordering::Relaxed);
                let fut: SharedScan = produce().shared();
                *guard = Some((id, fut.clone()));
                (id, fut)
            }
        };

        let result = fut.await;

        // Clear the slot so the next caller starts a fresh scan — but only if it
        // still holds the future we just awaited. A newer scan may already have
        // replaced it, in which case leave that one alone.
        let mut guard = self.inflight.lock().await;
        if guard.as_ref().map(|(id, _)| *id) == Some(id) {
            *guard = None;
        }
        result
    }
}

/// Per-user log directory, following each platform's convention. Chosen so a
/// user (or we, when debugging) can find `rove.log.<date>` without root.
fn log_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|d| std::path::PathBuf::from(d).join("rove").join("logs"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join("Library/Logs/rove"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(state) = std::env::var_os("XDG_STATE_HOME") {
            return Some(std::path::PathBuf::from(state).join("rove"));
        }
        std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/state/rove"))
    }
}

/// Start file logging into a daily-rolled `rove.log` under [`log_dir`]. The
/// returned guard flushes the non-blocking writer on drop, so the caller must
/// hold it for the process's lifetime. Level defaults to `info`; override with
/// the `ROVE_LOG` env var (e.g. `ROVE_LOG=debug`). Best-effort — returns
/// `None` if the log dir can't be created rather than failing startup.
fn init_logging() -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let dir = log_dir()?;
    std::fs::create_dir_all(&dir).ok()?;

    let (writer, guard) = tracing_appender::non_blocking(tracing_appender::rolling::daily(
        &dir,
        "rove.log",
    ));
    let filter = tracing_subscriber::EnvFilter::try_from_env("ROVE_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let ok = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .with_ansi(false)
        .with_target(false)
        .try_init()
        .is_ok();
    ok.then_some(guard)
}

/// Route panics to the log file (in addition to the default stderr handler), so
/// a crash leaves a durable breadcrumb even when the app was launched from a
/// desktop menu with no visible console.
fn install_panic_logger() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!(target: "panic", "{info}");
        default(info);
    }));
}

#[tauri::command]
async fn get_network_info() -> NetworkInfo {
    tracing::info!("network info requested");
    let started = std::time::Instant::now();
    let info = rove_core::network_info::network_info().await;
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis() as u64,
        interface = ?info.interface_name,
        "network info resolved"
    );
    info
}

#[tauri::command]
async fn get_interfaces() -> Vec<InterfaceSummary> {
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
async fn get_devices(
    store: tauri::State<'_, Arc<Store>>,
    scanner: tauri::State<'_, Arc<DeviceScanner>>,
) -> Result<LanDeviceScan, ()> {
    tracing::info!("device scan started");
    let started = std::time::Instant::now();
    let scan = scanner.scan().await;
    tracing::info!(
        devices = scan.devices.len(),
        subnet = ?scan.subnet,
        interface = ?scan.interface_name,
        elapsed_ms = started.elapsed().as_millis() as u64,
        "device scan finished"
    );
    let _ = store.record_devices(&scan.devices, rove_core::net_util::now_ms() as i64);
    Ok(scan)
}


#[tauri::command]
async fn run_diagnostics() -> NetworkDiagnostics {
    rove_core::diagnostics::run().await
}

#[tauri::command]
async fn get_public_ip() -> Option<String> {
    rove_core::network_info::public_ip().await
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
    state.throughput_active.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn unsubscribe_live_throughput(state: tauri::State<'_, AppState>) {
    state.throughput_active.store(false, Ordering::Relaxed);
}

/// TEMP DIAGNOSTIC: surface frontend errors in the dev terminal.
#[tauri::command]
fn __diag(msg: String) {
    eprintln!("Rove[js]: {msg}");
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

    let store = match Store::open(&data_dir.join("rove.db")) {
        Ok(store) => Arc::new(store),
        Err(err) => {
            tracing::error!("failed to open database: {err}");
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
                tracing::error!("usage sampler tick panicked; continuing");
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
fn spawn_route_monitor(handle: tauri::AppHandle) {
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

/// Reveal the main window and pull it to the foreground.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Install a GLib log handler that drops warnings from the
/// `libayatana-appindicator` domain, silencing the library's runtime
/// deprecation notice without affecting any other log output. Idempotent in
/// practice — `build_tray` is only called once — but installing twice would
/// merely stack a second identical filter.
#[cfg(target_os = "linux")]
fn suppress_appindicator_deprecation_warning() {
    glib::log_set_handler(
        Some("libayatana-appindicator"),
        glib::LogLevels::LEVEL_WARNING,
        false, // not fatal
        false, // no recursion
        |_domain, _level, _message| {
            // Intentionally swallow: the deprecation targets upstream, not us.
        },
    );
}

/// Build the system tray icon and its menu. The menu (Open / Quit) is the whole
/// interaction: it's a native menu, so it renders identically and reliably on
/// Windows, macOS and every Linux desktop — no custom webview panel to paint.
/// Returns an error if the platform can't host a tray, letting the caller fall
/// back to quit-on-close.
fn build_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // On Linux, tray-icon drives libayatana-appindicator3 (the GTK variant),
    // which prints a deprecation WARNING to stderr the first time it's touched:
    //   "libayatana-appindicator is deprecated. Please use
    //    libayatana-appindicator-glib in newly written code."
    // That advice targets upstream tao/tray-icon, not us — there's no glib-only
    // tray API exposed here — so the message is pure noise. Swallow just that
    // one log domain's warnings (everything else still prints normally).
    #[cfg(target_os = "linux")]
    suppress_appindicator_deprecation_warning();

    let open = MenuItem::with_id(app, "open", "Open Rove", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Rove", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    // A dedicated tray glyph: the bare Rove Mark, monochrome on a
    // transparent background — no rounded tile — so it sits flush in the menu
    // bar / taskbar like other native tray icons rather than showing the boxed
    // app icon.
    //
    // The glyph colour has to differ by platform. macOS treats a black-on-alpha
    // image as a *template* and tints it to the menu bar itself (see
    // `icon_as_template` below), so black is correct there. Windows and Linux
    // ignore the template flag and paint the pixels as-is — a black glyph then
    // vanishes on their (dark by default) taskbars — so they get a white glyph
    // with the same alpha. Both PNGs share `tray.png`'s exact silhouette.
    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-light.png"))?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        // Render as a macOS template image: the system ignores the glyph's own
        // colour and tints it to match the menu bar, so the mark stays legible
        // on both light and dark bars. No-op on other platforms.
        .icon_as_template(true)
        .tooltip("Rove")
        .menu(&menu)
        // Left-click opens the app directly; the menu (Open / Quit) is reserved
        // for right-click. Disabling the built-in left-click menu lets us handle
        // the left button ourselves in `on_tray_icon_event`.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // A completed left-click (button released over the icon) surfaces the
            // main window. Right-click falls through to the native menu.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn run() {
    // File logging first, so everything below — including a panic during setup —
    // lands in the log. The guard flushes on drop, so it must outlive the app;
    // hold it until `run()` returns.
    let _log_guard = init_logging();
    install_panic_logger();
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
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            throughput_active: AtomicBool::new(false),
            tray_active: AtomicBool::new(false),
        })
        .manage(Arc::new(DeviceScanner::default()))
        .setup(|app| {
            // macOS 14+ withholds the Wi-Fi SSID unless the app holds Location
            // authorization; prompt once at startup. No-op on other platforms,
            // and this runs on the main thread as CoreLocation requires.
            let loc_status = rove_core::platform::mac_native::request_location_permission();
            tracing::info!(status = loc_status, "location authorization");

            let handle = app.handle().clone();
            init_store(app);
            spawn_usage_sampler(handle.clone());
            spawn_throughput_broadcaster(handle.clone());
            spawn_route_monitor(handle.clone());

            // If the tray comes up, closing the window will hide to tray;
            // otherwise we leave close-to-quit intact so the app stays reachable.
            match build_tray(&handle) {
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
            __diag,
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
                show_main_window(_app_handle);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    fn canned_scan() -> LanDeviceScan {
        LanDeviceScan {
            devices: Vec::new(),
            subnet: None,
            interface_name: None,
            scanned_at: 0,
            dhcp_status: "unavailable",
        }
    }

    /// Overlapping callers must coalesce onto one underlying scan. This is the
    /// property that stops the ping-subprocess storm from multiplying.
    #[tokio::test]
    async fn overlapping_scans_run_once() {
        const N: usize = 32;
        let scanner = Arc::new(DeviceScanner::default());
        let runs = Arc::new(AtomicUsize::new(0));
        // Release all callers at the same instant so they genuinely overlap.
        let gate = Arc::new(tokio::sync::Barrier::new(N));

        let mut handles = Vec::with_capacity(N);
        for _ in 0..N {
            let scanner = scanner.clone();
            let runs = runs.clone();
            let gate = gate.clone();
            handles.push(tokio::spawn(async move {
                gate.wait().await;
                scanner
                    .scan_with(|| {
                        let runs = runs.clone();
                        Box::pin(async move {
                            runs.fetch_add(1, Ordering::SeqCst);
                            // Hold the scan in flight long enough that every
                            // caller arrives while it's still running.
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            canned_scan()
                        })
                    })
                    .await
            }));
        }
        for h in handles {
            h.await.unwrap();
        }

        assert_eq!(
            runs.load(Ordering::SeqCst),
            1,
            "all {N} overlapping callers should share a single scan"
        );
        // The slot must be released afterwards, so a later call scans afresh.
        assert!(scanner.inflight.lock().await.is_none());
    }

    /// Non-overlapping callers must each get their own fresh scan — the guard
    /// coalesces concurrency, it does not cache results.
    #[tokio::test]
    async fn sequential_scans_each_run() {
        let scanner = DeviceScanner::default();
        let runs = Arc::new(AtomicUsize::new(0));
        for _ in 0..3 {
            let runs = runs.clone();
            scanner
                .scan_with(|| {
                    Box::pin(async move {
                        runs.fetch_add(1, Ordering::SeqCst);
                        canned_scan()
                    })
                })
                .await;
        }
        assert_eq!(runs.load(Ordering::SeqCst), 3);
    }
}
