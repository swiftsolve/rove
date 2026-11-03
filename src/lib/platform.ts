/**
 * True on macOS, where a LAN scan raises the Local Network permission prompt,
 * so scans wait for the user to open Devices or tap Scan.
 */
export const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** True on Windows. Used to tailor platform-specific guidance (e.g. Windows
 * has no privileged-port restriction, so DHCP capture needs no setup there). */
export const IS_WINDOWS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Win')

/** The OS's name, for display (About): macOS, Windows, Linux, or Desktop when it can't tell. */
export const PLATFORM_NAME = IS_MAC
  ? 'macOS'
  : IS_WINDOWS
    ? 'Windows'
    : typeof navigator !== 'undefined' && /Linux/i.test(navigator.userAgent)
      ? 'Linux'
      : 'Desktop'

/**
 * True on WebKitGTK, the Linux Tauri webview. Two of its quirks need dodging,
 * and neither is feature-detectable — the APIs are advertised, they just break:
 *
 * - View Transitions snapshot through WebKit's accelerated compositor, which
 *   segfaults in libnvidia-eglcore on NVIDIA (confirmed via core dump — SIGSEGV
 *   on the main thread inside libwebkit2gtk). 2.52 advertises
 *   `startViewTransition`, so only engine detection gets us out.
 * - `<audio>` decodes through GStreamer, which the AppImage bundle doesn't ship
 *   (Tauri gates that behind `bundleMediaFramework`, worth ~15-35MB). The .deb
 *   is fine — it depends on the system libwebkit2gtk, which pulls GStreamer in.
 *
 * Chromium on Linux also reports AppleWebKit, hence the Chrom(e|ium) exclusion.
 */
export const IS_WEBKIT_GTK =
  typeof navigator !== 'undefined' &&
  /\bLinux\b/.test(navigator.userAgent) &&
  navigator.userAgent.includes('AppleWebKit') &&
  !/Chrom(e|ium)/.test(navigator.userAgent)
