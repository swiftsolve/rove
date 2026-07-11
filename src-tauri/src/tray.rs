//! The system tray icon and its menu — the app's presence when the window is
//! closed to the background.
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Reveal the main window and pull it to the foreground.
pub fn show_main_window(app: &tauri::AppHandle) {
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
pub fn build_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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
