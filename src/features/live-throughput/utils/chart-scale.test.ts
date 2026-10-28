import { describe, expect, it } from 'vitest'
import { resolveChartScale } from '@/features/live-throughput/utils/chart-scale'

describe('resolveChartScale', () => {
  it('starts at the smallest step with no traffic', () => {
    expect(resolveChartScale([], [])).toBe(10)
  })

  it('fits light traffic rather than the full link speed', () => {
    expect(resolveChartScale([30], [5], { linkCapacityMbps: 1000 })).toBe(50)
  })

  it('locks to the link speed during a speed test', () => {
    expect(resolveChartScale([30], [5], { linkCapacityMbps: 940, isSpeedTestRunning: true })).toBe(1000)
  })

  it('drops a burst once traffic has settled', () => {
    const download = [...Array<number>(15).fill(500), ...Array<number>(5).fill(2)]
    expect(resolveChartScale(download, Array<number>(20).fill(0))).toBe(10)
  })

  it('rounds past the last step up to the next thousand', () => {
    expect(resolveChartScale([6000], [0])).toBe(8000)
  })
})
