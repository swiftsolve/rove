import { describe, expect, it } from 'vitest'

import type { LatencySample } from './service-latency'
import {
  areaPoints,
  chartDescription,
  chartStatus,
  nearestPointIndex,
  placePoints,
  splitIntoRuns,
  toSvgPoints,
  VERTICAL_PAD,
} from './sparkline'

function samples(...values: (number | null)[]): LatencySample[] {
  return values.map((ms, i) => ({ ts: i, ms }))
}

describe('chartStatus', () => {
  it('rates a failed probe negative and a reading by its latency band', () => {
    expect(chartStatus(null)).toBe('negative')
    expect(chartStatus(50)).toBe('positive')
    expect(chartStatus(200)).toBe('warning')
    expect(chartStatus(500)).toBe('negative')
  })
})

describe('placePoints', () => {
  it('spreads the samples edge to edge and scales them over the observed range', () => {
    const points = placePoints(samples(10, 20, 30), 100, 20, undefined)
    expect(points.map((p) => p.x)).toEqual([0, 50, 100])
    expect(points.map((p) => p.y)).toEqual([20 - VERTICAL_PAD, 10, VERTICAL_PAD])
  })

  it('right-aligns a partial history across the slots', () => {
    const points = placePoints(samples(10, 20), 100, 20, 5)
    expect(points.map((p) => p.x)).toEqual([75, 100])
  })

  it('puts a lone sample at the right edge', () => {
    expect(placePoints(samples(10), 100, 20, undefined)[0]?.x).toBe(100)
  })

  it('sits identical values on the midline and failed ones on the baseline', () => {
    const points = placePoints(samples(15, null, 15), 100, 20, undefined)
    expect(points.map((p) => p.y)).toEqual([10, 20 - VERTICAL_PAD, 10])
  })
})

describe('splitIntoRuns', () => {
  it('breaks the line at each failed probe', () => {
    const points = placePoints(samples(1, 2, null, 3, null, null, 4, 5), 100, 20, undefined)
    expect(splitIntoRuns(points).map((run) => run.map((p) => p.sample.ms))).toEqual([[1, 2], [3], [4, 5]])
  })

  it('has no runs when every probe failed', () => {
    expect(splitIntoRuns(placePoints(samples(null, null), 100, 20, undefined))).toEqual([])
  })
})

describe('toSvgPoints / areaPoints', () => {
  const run = splitIntoRuns(placePoints(samples(10, 20), 100, 20, undefined))[0]

  it('lists the points as x,y pairs', () => {
    expect(run && toSvgPoints(run)).toBe(`0,${20 - VERTICAL_PAD} 100,${VERTICAL_PAD}`)
  })

  it('closes the area down to the baseline', () => {
    expect(run && areaPoints(run, 17)).toBe(`0,17 100,3 100,17 0,17`)
  })
})

describe('chartDescription', () => {
  it('says the span, the latency range and the failures', () => {
    expect(chartDescription(samples(18.2, null, 42), 'GitHub')).toBe(
      'GitHub latency over the last 3 checks: 18.2 ms to 42.0 ms, 1 failed',
    )
  })

  it('gives one value when the range is flat, and leads with Latency unlabelled', () => {
    expect(chartDescription(samples(20), undefined)).toBe('Latency over the last 1 check: 20.0 ms')
  })

  it('says only the failures when nothing answered', () => {
    expect(chartDescription(samples(null, null), 'A')).toBe('A latency over the last 2 checks: 2 failed')
  })
})

describe('nearestPointIndex', () => {
  it('picks the point closest to x, the first on a tie', () => {
    const points = placePoints(samples(1, 2, 3), 100, 20, undefined)
    expect(nearestPointIndex(points, 10)).toBe(0)
    expect(nearestPointIndex(points, 60)).toBe(1)
    expect(nearestPointIndex(points, 25)).toBe(0)
    expect(nearestPointIndex(points, 200)).toBe(2)
  })
})
