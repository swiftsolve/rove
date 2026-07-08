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
