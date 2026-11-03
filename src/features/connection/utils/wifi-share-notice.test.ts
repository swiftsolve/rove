import { describe, expect, it } from 'vitest'

import type { WifiShare } from '@/types'

import { shareNotice } from './wifi-share-notice'

const SHARE: WifiShare = { ssid: 'Home', encryption: 'WPA', password: 'secret', qrSvg: '<svg/>' }

describe('shareNotice', () => {
  it('words the backend errors it knows, pinned to their exact text', () => {
    expect(shareNotice(null, 'Not connected to Wi-Fi.')?.title).toBe('Not on Wi‑Fi')
    expect(shareNotice(null, 'Wi-Fi network name is unavailable.')?.title).toBe('Network name hidden')
  })

  it('shows any other error as it came', () => {
    expect(shareNotice(null, 'Keychain locked')).toMatchObject({ icon: 'alert', description: 'Keychain locked' })
  })

  it('asks for the password when a secured network came back without one, and is quiet otherwise', () => {
    expect(shareNotice({ ...SHARE, password: null }, null)?.icon).toBe('lock')
    expect(shareNotice({ ...SHARE, encryption: 'nopass', password: null }, null)).toBeNull()
    expect(shareNotice(SHARE, null)).toBeNull()
  })
})
