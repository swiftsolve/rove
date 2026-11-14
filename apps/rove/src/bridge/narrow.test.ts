import { describe, expect, it } from 'vitest'

import type { LanDevice, LanDeviceScan, NetworkEvent } from '@/types'

import { knownEvents, narrowDeviceScan } from './narrow'

/** What a newer backend might send: values this UI has never heard of. */
const device = (kind: string) => ({ kind, ip: '192.168.1.9' }) as unknown as LanDevice
const event = (type: string, kind: string | null = null) => ({ id: 1, type, kind }) as unknown as NetworkEvent

describe('narrowDeviceScan', () => {
  it('reads a device kind it does not know as unknown', () => {
    const scan = { devices: [device('router'), device('robot-vacuum')] } as LanDeviceScan
    expect(narrowDeviceScan(scan).devices.map((d) => d.kind)).toEqual(['router', 'unknown'])
  })

  it('returns a scan of known kinds untouched', () => {
    const scan = { devices: [device('phone')] } as LanDeviceScan
    expect(narrowDeviceScan(scan)).toBe(scan)
  })
})

describe('knownEvents', () => {
  it('drops an event type it does not know, and reads an unknown kind as unknown', () => {
    const events = knownEvents([event('device_joined', 'drone'), event('satellite_lost'), event('device_offline')])
    expect(events.map((e) => [e.type, e.kind])).toEqual([
      ['device_joined', 'unknown'],
      ['device_offline', null],
    ])
  })
})
