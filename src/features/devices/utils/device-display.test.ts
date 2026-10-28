import { describe, expect, it } from 'vitest'
import type { LanDevice } from '@/types'
import {
  deviceMetaParts,
  deviceName,
  gatewayProduct,
  lastSeenAge,
  sortDevices,
} from '@/features/devices/utils/device-display'

function device(overrides: Partial<LanDevice> = {}): LanDevice {
  return {
    kind: 'unknown',
    kindConfidence: 'high',
    ip: '192.168.1.20',
    mac: 'aa:bb:cc:dd:ee:ff',
    vendor: null,
    hostname: null,
    model: null,
    os: null,
    isRandomizedMac: false,
    isGateway: false,
    isSelf: false,
    isReachable: true,
    lastSeen: null,
    ...overrides,
  }
}

const MINUTE = 60_000

describe('deviceName', () => {
  it('names the gateway and this machine by their role', () => {
    expect(deviceName(device({ isGateway: true, hostname: 'router.lan' }))).toBe('Router')
    expect(deviceName(device({ isSelf: true, hostname: 'laptop' }))).toBe('This device')
  })

  it('prefers a hostname over everything else it knows', () => {
    expect(deviceName(device({ hostname: 'pixel-8', vendor: 'Google', kind: 'phone' }))).toBe('pixel-8')
  })

  it('pairs a known maker with the kind', () => {
    expect(deviceName(device({ vendor: 'Apple', kind: 'phone' }))).toBe('Apple · Phone')
    expect(deviceName(device({ vendor: 'Synology' }))).toBe('Synology')
  })

  it('names a smart-home device by its maker alone', () => {
    expect(deviceName(device({ vendor: 'Espressif', kind: 'iot' }))).toBe('Espressif')
  })

  it('builds a name from the OS and kind when there is no maker', () => {
    expect(deviceName(device({ os: 'Android', kind: 'phone' }))).toBe('Android phone')
    expect(deviceName(device({ os: 'Android' }))).toBe('Android device')
    expect(deviceName(device({ kind: 'tv' }))).toBe('TV')
    expect(deviceName(device())).toBe('Generic device')
  })
})

describe('lastSeenAge', () => {
  const now = 1_000 * MINUTE

  it('shows nothing for an online device or one seen moments ago', () => {
    expect(lastSeenAge(device({ lastSeen: now - 10 * MINUTE }), now)).toBeNull()
    expect(lastSeenAge(device({ isReachable: false, lastSeen: now - MINUTE }), now)).toBeNull()
    expect(lastSeenAge(device({ isReachable: false, lastSeen: null }), now)).toBeNull()
  })

  it('rounds down to minutes, hours or days', () => {
    const offline = (ago: number): LanDevice => device({ isReachable: false, lastSeen: now - ago })
    expect(lastSeenAge(offline(5 * MINUTE), now)).toBe('5m ago')
    expect(lastSeenAge(offline(3 * 60 * MINUTE + 59 * MINUTE), now)).toBe('3h ago')
    expect(lastSeenAge(offline(2 * 24 * 60 * MINUTE), now)).toBe('2d ago')
  })
})

describe('deviceMetaParts', () => {
  it('drops unknown parts and any that repeat the name or an earlier part', () => {
    const apple = device({ kind: 'phone', vendor: 'Apple', os: 'Apple', model: 'iPhone15,2' })
    expect(deviceMetaParts(apple, 'Apple · Phone')).toEqual(['Phone', 'Apple', 'iPhone15,2'])
    expect(deviceMetaParts(device({ vendor: 'Synology' }), 'Synology')).toEqual([])
  })
})

describe('gatewayProduct', () => {
  it('skips a generic hostname for the model', () => {
    expect(gatewayProduct(device({ hostname: 'Router', model: 'Giga Hub 2.0' }))).toBe('Giga Hub 2.0')
    expect(gatewayProduct(device({ hostname: 'Fritz!Box 7590', model: 'FRITZ' }))).toBe('Fritz!Box 7590')
    expect(gatewayProduct(device({ hostname: 'gateway' }))).toBeNull()
  })
})

describe('sortDevices', () => {
  it('keeps online devices in scan order, then offline ones newest first', () => {
    const a = device({ ip: 'a' })
    const b = device({ ip: 'b', isReachable: false, lastSeen: 1 })
    const c = device({ ip: 'c' })
    const d = device({ ip: 'd', isReachable: false, lastSeen: 2 })
    expect(sortDevices([b, a, d, c]).map((x) => x.ip)).toEqual(['a', 'c', 'd', 'b'])
  })
})
