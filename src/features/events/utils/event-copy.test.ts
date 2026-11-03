import { describe, expect, it } from 'vitest'

import {
  eventSubject,
  initialScanTitle,
  isKnownEvent,
  offlineDurations,
  subjectKind,
} from '@/features/events/utils/event-copy'
import type { NetworkEvent, NetworkEventType } from '@/types'

function event(id: number, type: NetworkEventType, overrides: Partial<NetworkEvent> = {}): NetworkEvent {
  return {
    id,
    ts: id * 1_000,
    type,
    severity: 'info',
    mac: null,
    ip: null,
    name: null,
    kind: null,
    oldValue: null,
    newValue: null,
    isRandomized: false,
    ...overrides,
  }
}

describe('offlineDurations', () => {
  it('pairs each reconnect with the loss it ended', () => {
    // Newest first, as the feed arrives.
    const events = [
      event(9, 'internet_restored'),
      event(7, 'internet_lost'),
      event(5, 'device_joined'),
      event(4, 'internet_restored'),
      event(1, 'internet_lost'),
    ]
    expect(offlineDurations(events)).toEqual(
      new Map([
        [4, 3_000],
        [9, 2_000],
      ]),
    )
  })

  it('skips a reconnect with no loss before it', () => {
    expect(offlineDurations([event(2, 'internet_restored')]).size).toBe(0)
  })
})

describe('eventSubject', () => {
  it('names the device, falling back by what is known', () => {
    expect(eventSubject(event(1, 'device_joined', { name: 'pixel-8' }))).toBe('pixel-8')
    expect(eventSubject(event(1, 'device_joined', { isRandomized: true }))).toBe('Private device')
    expect(eventSubject(event(1, 'device_joined'))).toBe('Unknown device')
  })

  it('has no device subject for internet events', () => {
    expect(eventSubject(event(1, 'internet_lost'))).toBeNull()
  })
})

describe('subjectKind', () => {
  it('drops a kind the name already says', () => {
    const phone = event(1, 'device_joined', { kind: 'phone' })
    expect(subjectKind(phone, 'Android phone')).toBeNull()
    expect(subjectKind(phone, 'pixel-8')).toBe('Phone')
    expect(subjectKind(event(1, 'device_joined', { kind: 'unknown' }), 'x')).toBeNull()
  })
})

describe('initialScanTitle', () => {
  it('counts the devices found', () => {
    expect(initialScanTitle(event(1, 'initial_scan', { newValue: '1' }))).toBe('1 device discovered')
    expect(initialScanTitle(event(1, 'initial_scan', { newValue: '12' }))).toBe('12 devices discovered')
  })
})

describe('isKnownEvent', () => {
  it('rejects a type the UI has no copy for', () => {
    expect(isKnownEvent(event(1, 'device_joined'))).toBe(true)
    expect(isKnownEvent(event(1, 'retired_type' as NetworkEventType))).toBe(false)
  })
})
