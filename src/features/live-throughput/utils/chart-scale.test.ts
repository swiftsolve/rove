import { describe, expect, it } from 'vitest'

import { lastResultOn, resolveChartScale } from '@/features/live-throughput/utils/chart-scale'
import type { NetworkInfo, SpeedHistoryEntry } from '@/types'

describe('resolveChartScale', () => {
  it('starts at the smallest step with no traffic', () => {
    expect(resolveChartScale([], [])).toBe(10)
  })

  it('fits light traffic rather than the full link speed', () => {
    expect(resolveChartScale([30], [5], { linkCapacityMbps: 1000 })).toBe(50)
  })

  it('holds the last result, with headroom, as a floor while a test downloads', () => {
    expect(resolveChartScale([30], [0], { linkCapacityMbps: 1200, testFloorMbps: 200 })).toBe(250)
  })

  it('grows past the floor when a test runs faster than last time', () => {
    expect(resolveChartScale([400], [0], { linkCapacityMbps: 1200, testFloorMbps: 200 })).toBe(500)
  })

  it('fits the traffic, not the link speed, during a test with no past result', () => {
    expect(resolveChartScale([30], [0], { linkCapacityMbps: 1200 })).toBe(50)
  })

  it('keeps a burst in scale while it is still on the chart, however quiet traffic is now', () => {
    const download = [500, ...Array<number>(59).fill(2)]
    expect(resolveChartScale(download, Array<number>(60).fill(0))).toBe(1000)
  })

  it('drops a burst once it has scrolled off', () => {
    expect(resolveChartScale(Array<number>(60).fill(2), Array<number>(60).fill(0))).toBe(10)
  })

  it('rounds past the last step up to the next thousand', () => {
    expect(resolveChartScale([6000], [0])).toBe(8000)
  })
})

describe('lastResultOn', () => {
  const entry = (connectionType: string, networkName: string | null, downloadMbps: number): SpeedHistoryEntry => ({
    timestamp: 0,
    downloadMbps,
    uploadMbps: 0,
    latencyMs: 0,
    jitterMs: 0,
    packetLoss: 0,
    connectionType,
    networkName,
    linkSpeedMbps: null,
    frequency: null,
  })
  const entries = [entry('wifi', 'Cafe', 50), entry('ethernet', null, 900), entry('wifi', 'Home', 300)]

  it('takes the newest result on the same Wi-Fi network', () => {
    const info = { connectionType: 'wifi', ssid: 'Home' } as NetworkInfo
    expect(lastResultOn(entries, info)?.downloadMbps).toBe(300)
  })

  it('matches Ethernet by medium alone', () => {
    const info = { connectionType: 'ethernet' } as NetworkInfo
    expect(lastResultOn(entries, info)?.downloadMbps).toBe(900)
  })

  it('has none for a network with no result yet', () => {
    expect(lastResultOn(entries, { connectionType: 'wifi', ssid: 'Office' } as NetworkInfo)).toBeUndefined()
  })
})
