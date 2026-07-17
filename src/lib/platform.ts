/**
 * True when running on macOS. Device discovery is gated behind the system
 * Local Network permission there, so we don't kick off a scan the moment Home
 * loads — we wait until the user opens Devices (or taps Scan on the Home
 * widget), which is a clearer moment to surface the permission prompt.
 */
export const IS_MAC =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** True on Windows. Used to tailor platform-specific guidance (e.g. Windows
 * has no privileged-port restriction, so DHCP capture needs no setup there). */
export const IS_WINDOWS =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Win')

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
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrom(e|ium)/.test(navigator.userAgent)
