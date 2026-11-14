//! The system tray icon and its menu: the app's presence when the window is
//! closed to the background.
use crate::error::log_if_failed;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Reveal the main window and pull it to the foreground.
pub fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        log_if_failed("show the main window", window.show());
        log_if_failed("unminimize the main window", window.unminimize());
        log_if_failed("focus the main window", window.set_focus());
    }
}

/// Drop warnings from the `libayatana-appindicator` GLib log domain only. On
/// first use the library warns that it's deprecated in favour of
/// libayatana-appindicator-glib; that's advice for tao/tray-icon upstream, with
/// no glib-only tray API for us to switch to.
#[cfg(target_os = "linux")]
fn suppress_appindicator_deprecation_warning() {
    glib::log_set_handler(
        Some("libayatana-appindicator"),
        glib::LogLevels::LEVEL_WARNING,
        false, // not fatal
        false, // no recursion
        |_domain, _level, _message| {},
    );
}

/// Build the tray icon and its native Open/Quit menu, which renders reliably on
/// every desktop where a custom webview panel wouldn't. Errors when the
/// platform can't host a tray, so the caller keeps quit-on-close.
pub fn build_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "linux")]
    suppress_appindicator_deprecation_warning();

    let open = MenuItem::with_id(app, "open", "Open Rove", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Rove", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    // The bare Rove Mark, monochrome with no tile, so it sits flush like other
    // tray icons. macOS tints a black template image to the menu bar; Windows
    // and Linux paint pixels as-is, where black vanishes on dark taskbars, so
    // they get the white glyph with the same silhouette.
    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-light.png"))?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        // No-op off macOS.
        .icon_as_template(true)
        .tooltip("Rove")
        .menu(&menu)
        // Left-click opens the app (below); the menu is for right-click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
