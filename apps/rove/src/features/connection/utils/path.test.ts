import { describe, expect, it } from 'vitest'

import type { NetworkInfo, SpeedHistoryEntry } from '@/types'

import { internetLinkState, lastTestOnNetwork } from './path'

const BASE = { interfaceName: 'en0', ipAddress: null, gateway: null, macAddress: null, dns: [] }

const wifi = (ssid: string): NetworkInfo => ({
  ...BASE,
  connectionType: 'wifi',
  isConnected: true,
  ssid,
  signalStrength: 84,
  signalDbm: -47,
  channel: 149,
  frequency: 5745,
  channelWidthMhz: 80,
  security: 'WPA3',
  wifiStandard: null,
  linkSpeedMbps: 1200,
})

const ethernet: NetworkInfo = {
  ...BASE,
  connectionType: 'ethernet',
  isConnected: true,
  linkSpeedMbps: 1000,
  duplex: 'full',
  vendor: null,
  product: null,
}

const entry = (timestamp: number, connectionType: string, networkName: string | null): SpeedHistoryEntry => ({
  timestamp,
  connectionType,
  networkName,
  linkSpeedMbps: null,
  frequency: null,
  downloadMbps: 100,
  uploadMbps: 10,
  latencyMs: 10,
  jitterMs: 1,
  packetLoss: 0,
})

/** Newest first, as the history returns it. */
const HISTORY = [entry(3, 'wifi', 'Cafe'), entry(2, 'ethernet', null), entry(1, 'wifi', 'Home')]

describe('path', () => {
  it('picks the newest test on the same Wi‑Fi network, or any wired one on Ethernet', () => {
    expect(lastTestOnNetwork(HISTORY, wifi('Home'))?.timestamp).toBe(1)
    expect(lastTestOnNetwork(HISTORY, wifi('Cafe'))?.timestamp).toBe(3)
    expect(lastTestOnNetwork(HISTORY, ethernet)?.timestamp).toBe(2)
  })

  it('finds no test on a new network, before the history loads, or offline', () => {
    expect(lastTestOnNetwork(HISTORY, wifi('Office'))).toBeNull()
    expect(lastTestOnNetwork(undefined, wifi('Home'))).toBeNull()
    expect(lastTestOnNetwork(HISTORY, null)).toBeNull()
  })

  it('reads the internet link as offline first, then untested, then healthy', () => {
    const test = entry(3, 'wifi', 'Cafe')
    expect(internetLinkState('offline', test)).toBe('offline')
    expect(internetLinkState('noInternet', test)).toBe('offline')
    expect(internetLinkState('online', null)).toBe('notTested')
    expect(internetLinkState('online', test)).toBe('healthy')
    // Before the first check, the status is unknown and counts as up.
    expect(internetLinkState(undefined, test)).toBe('healthy')
  })
})
