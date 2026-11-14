import type { WifiShare } from '@/types'

/** Why the dialog shows a notice instead of a QR code, and which icon says so. */
export type ShareNotice = {
  icon: 'wifi-off' | 'lock' | 'alert'
  title: string
  description: string
}

// Matched against the backend's error text (crates/rove-core/src/connection/
// wifi_share.rs), which says why in words; anything else is shown as it came.
function describeShareError(message: string): ShareNotice {
  if (/not connected/i.test(message)) {
    return { icon: 'wifi-off', title: 'Not on Wi‑Fi', description: 'Connect to a Wi‑Fi network to share it.' }
  }
  if (/name is unavailable/i.test(message)) {
    // macOS withholds the SSID without Location Services, so point there
    // without asserting it.
    return {
      icon: 'wifi-off',
      title: 'Network name hidden',
      description: 'Your system withheld it. On a Mac, check Location Services.',
    }
  }
  return { icon: 'alert', title: 'Couldn’t make a QR code', description: message }
}

const MISSING_PASSWORD: ShareNotice = {
  icon: 'lock',
  title: 'Password not available',
  description: 'Allow access when asked, so the code can include it.',
}

/** The notice to show instead of the QR code, if any. */
export function shareNotice(share: WifiShare | null, error: string | null): ShareNotice | null {
  if (error) return describeShareError(error)
  if (share && share.encryption !== 'nopass' && !share.password) return MISSING_PASSWORD
  return null
}
