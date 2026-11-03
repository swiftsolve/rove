import { describe, expect, it } from 'vitest'

import type { NetworkInfo } from '@/types'

import { describeConnectionStatus } from './connection-status'

const BASE = { interfaceName: 'en0', ipAddress: '192.168.1.42', gateway: '192.168.1.1', macAddress: null, dns: [] }
const WIFI = {
  ...BASE,
  connectionType: 'wifi',
  isConnected: true,
  ssid: 'Home',
  signalStrength: 80,
  signalDbm: null,
  channel: null,
  frequency: null,
  security: null,
  wifiStandard: null,
  linkSpeedMbps: null,
} as const satisfies NetworkInfo
const OFFLINE = { ...BASE, connectionType: 'unknown', isConnected: false } as const satisfies NetworkInfo

describe('describeConnectionStatus', () => {
  it('is connecting until the link is known', () => {
    expect(describeConnectionStatus(null, null)).toEqual({ tone: 'neutral', label: 'Connecting…', internet: undefined })
  })

  it('is offline with no link, whatever the internet check says', () => {
    expect(describeConnectionStatus(OFFLINE, 'online')).toMatchObject({ label: 'Offline', internet: 'offline' })
  })

  it('reads a live link with a dead WAN as No internet', () => {
    expect(describeConnectionStatus(WIFI, 'noInternet')).toMatchObject({ tone: 'negative', label: 'No internet' })
  })

  it('names the link once it reaches the internet, and before the first check lands', () => {
    expect(describeConnectionStatus(WIFI, 'online')).toMatchObject({ tone: 'positive', label: 'Wi‑Fi' })
    expect(describeConnectionStatus(WIFI, null)).toMatchObject({ tone: 'positive', internet: 'online' })
  })
})
