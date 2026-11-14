import { describe, expect, it } from 'vitest'

import type { NetworkInfo, NetworkInfoBase, SpeedRunContext } from '@/types'

import { connectionFromContext, connectionFromNetworkInfo, connectionKind, connectionName } from './connection'

const BASE: NetworkInfoBase = {
  interfaceName: 'en0',
  isConnected: true,
  ipAddress: null,
  gateway: null,
  macAddress: null,
  dns: [],
}

const WIFI: NetworkInfo = {
  ...BASE,
  connectionType: 'wifi',
  isConnected: true,
  ssid: 'Home',
  signalStrength: null,
  signalDbm: null,
  channel: null,
  frequency: 5180,
  channelWidthMhz: null,
  security: null,
  wifiStandard: null,
  linkSpeedMbps: null,
}

const ETHERNET: NetworkInfo = {
  ...BASE,
  connectionType: 'ethernet',
  isConnected: true,
  linkSpeedMbps: 1000,
  duplex: null,
  vendor: null,
  product: null,
}

function context(connectionType: string, networkName: string | null = null): SpeedRunContext {
  return { connectionType, networkName, linkSpeedMbps: null, frequency: 2437 }
}

describe('connectionKind', () => {
  it('keeps Wi-Fi and Ethernet, and calls anything else unknown', () => {
    expect(connectionKind('wifi')).toBe('wifi')
    expect(connectionKind('ethernet')).toBe('ethernet')
    expect(connectionKind('unknown')).toBe('unknown')
    expect(connectionKind('cellular')).toBe('unknown')
  })
})

describe('connectionName', () => {
  it('uses the network name when there is one', () => {
    expect(connectionName('wifi', 'Home')).toBe('Home')
  })

  it('falls back to the medium', () => {
    expect(connectionName('wifi', null)).toBe('Wi‑Fi')
    expect(connectionName('ethernet', null)).toBe('Ethernet')
    expect(connectionName('unknown', null)).toBe('Unknown')
  })
})

describe('connectionFromContext', () => {
  it('names a Wi-Fi run by its network and band', () => {
    expect(connectionFromContext(context('wifi', 'Home'))).toEqual({ type: 'wifi', name: 'Home', band: '2.4 GHz' })
  })

  it('gives an Ethernet run no name or band', () => {
    expect(connectionFromContext(context('ethernet', 'ignored'))).toEqual({ type: 'ethernet', name: null, band: null })
  })

  it('is null for any other medium', () => {
    expect(connectionFromContext(context('unknown'))).toBeNull()
  })
})

describe('connectionFromNetworkInfo', () => {
  it('reads the live Wi-Fi network and band', () => {
    expect(connectionFromNetworkInfo(WIFI)).toEqual({ type: 'wifi', name: 'Home', band: '5 GHz' })
  })

  it('reads Ethernet with no name or band', () => {
    expect(connectionFromNetworkInfo(ETHERNET)).toEqual({ type: 'ethernet', name: null, band: null })
  })

  it('is null with no network info or a disconnected one', () => {
    expect(connectionFromNetworkInfo(null)).toBeNull()
    expect(connectionFromNetworkInfo({ ...BASE, connectionType: 'unknown', isConnected: false })).toBeNull()
  })
})
