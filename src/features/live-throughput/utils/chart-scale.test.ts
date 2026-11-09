import { describe, expect, it } from 'vitest'

import { resolveChartScale } from '@/features/live-throughput/utils/chart-scale'

describe('resolveChartScale', () => {
  it('starts at the smallest step with no traffic', () => {
    expect(resolveChartScale([], [])).toBe(10)
  })

  it('fits light traffic rather than the full link speed', () => {
    expect(resolveChartScale([30], [5], { linkCapacityMbps: 1000 })).toBe(50)
  })

  it('fits the traffic, not the link speed, during a test', () => {
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
