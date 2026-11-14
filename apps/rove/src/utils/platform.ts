/**
 * True on macOS, where a LAN scan raises the Local Network permission prompt,
 * so scans wait for the user to open Devices or tap Scan.
 */
export const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** True on Windows, where the per-app usage views need Rove relaunched as administrator. */
export const IS_WINDOWS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Win')

const IS_LINUX = typeof navigator !== 'undefined' && /Linux/i.test(navigator.userAgent)

function platformName(): string {
  if (IS_MAC) return 'macOS'
  if (IS_WINDOWS) return 'Windows'
  if (IS_LINUX) return 'Linux'
  return 'Desktop'
}

/** The OS's name, for display (About): macOS, Windows, Linux, or Desktop when it can't tell. */
export const PLATFORM_NAME = platformName()

/**
 * True on WebKitGTK, the Linux Tauri webview. Two of its quirks need dodging,
 * and neither is feature-detectable: the APIs are advertised, they just break:
 *
 * - View Transitions snapshot through WebKit's accelerated compositor, which
 *   segfaults in libnvidia-eglcore on NVIDIA (a core dump shows SIGSEGV on
 *   the main thread inside libwebkit2gtk). 2.52 advertises
 *   `startViewTransition`, so only engine detection gets us out.
 * - `<audio>` decodes through GStreamer, which the AppImage bundle doesn't ship
 *   (Tauri gates that behind `bundleMediaFramework`, worth ~15-35MB). The .deb
 *   is fine: it depends on the system libwebkit2gtk, which pulls GStreamer in.
 *
 * Chromium on Linux also reports AppleWebKit, hence the Chrom(e|ium) exclusion.
 */
export const IS_WEBKIT_GTK =
  typeof navigator !== 'undefined' &&
  /\bLinux\b/.test(navigator.userAgent) &&
  navigator.userAgent.includes('AppleWebKit') &&
  !/Chrom(e|ium)/.test(navigator.userAgent)
