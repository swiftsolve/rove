//! Real per-application icons on macOS, Windows and Linux.
//!
//! The usage views ([`crate::apps`], [`crate::apps::hosts`]) know only a
//! process name and pid. This resolves that to the icon the Dock, Finder or
//! Explorer would show, as a small PNG (or SVG) `data:` URI. The pid is tried
//! first, being the exact process that moved the bytes; the name catches a pid
//! that has exited by the time its icon is looked up.
//!
//!   * **macOS**: `NSRunningApplication(pid)`'s icon, gated on `bundleURL` so
//!     daemons don't get a generic placeholder, else
//!     `NSWorkspace.fullPathForApplication` by name via Launch Services.
//!   * **Windows**: the pid's (or a same-named live process's) executable, then
//!     the Shell's icon for it via `IShellItemImageFactory`: the same
//!     high-resolution icon Explorer draws, alpha included.
//!   * **Linux**: the pid's (or a same-named live process's) `.desktop` entry:
//!     its Flatpak app id or snap cgroup when sandboxed, else its executable or
//!     name against each entry's `Exec`, `StartupWMClass` and id. The entry's
//!     `Icon=` comes from the `hicolor` theme or `pixmaps` (or is a path), PNGs
//!     scaled down to 64px, SVGs passed through.
//!
//! Anything else (CLIs, system daemons, unknown names) gets `None` and the UI
//! shows a favicon or monogram. Other platforms always return `None`.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

/// No icon source on this platform; the UI shows a favicon or monogram.
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn app_icon_data_uri(_name: &str, _pid: Option<u32>) -> Option<String> {
    None
}
