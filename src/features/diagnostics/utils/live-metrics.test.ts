import { describe, expect, it } from 'vitest'

import type { NetworkDiagnostics } from '@/types'

import { overlayLiveMetrics } from './live-metrics'

const SNAPSHOT = {
  gatewayPing: { avgMs: 40, jitterMs: 4, packetLoss: 0 },
  internet: 'online',
} as NetworkDiagnostics
const LIVE_PING = { avgMs: 8, jitterMs: 1, packetLoss: 0 }

describe('overlayLiveMetrics', () => {
  it('is null until the snapshot lands', () => {
    expect(overlayLiveMetrics({ data: null, updatedAt: 0 }, { data: null, updatedAt: 0 })).toBeNull()
  })

  it('lays a newer live reading over the snapshot, a null ping included', () => {
    const live = { data: { gatewayPing: null, internet: 'noInternet' as const }, updatedAt: 2 }
    expect(overlayLiveMetrics({ data: SNAPSHOT, updatedAt: 1 }, live)).toMatchObject({
      gatewayPing: null,
      internet: 'noInternet',
    })
  })

  it('keeps a snapshot that refetched after the cached live reading', () => {
    const live = { data: { gatewayPing: LIVE_PING, internet: 'online' as const }, updatedAt: 1 }
    expect(overlayLiveMetrics({ data: SNAPSHOT, updatedAt: 2 }, live)).toBe(SNAPSHOT)
  })
})
