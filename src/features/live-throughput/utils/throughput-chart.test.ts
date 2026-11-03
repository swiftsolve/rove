import { describe, expect, it } from 'vitest'

import { buildChartRows, formatAxisLabel } from './throughput-chart'

describe('buildChartRows', () => {
  it('pairs the samples by index, reading a missing one as zero', () => {
    expect(buildChartRows([10, 20], [1])).toEqual([
      { index: 0, down: 10, up: 1 },
      { index: 1, down: 20, up: 0 },
    ])
  })

  it('seeds a zero before a lone sample, so it draws as a line', () => {
    expect(buildChartRows([5], [2])).toEqual([
      { index: -1, down: 0, up: 0 },
      { index: 0, down: 5, up: 2 },
    ])
  })

  it('has no rows before the first sample', () => {
    expect(buildChartRows([], [])).toEqual([])
  })
})

describe('formatAxisLabel', () => {
  it('writes megabits with an M and gigabits with a G', () => {
    expect(formatAxisLabel(0)).toBe('0')
    expect(formatAxisLabel(2.5)).toBe('2.5M')
    expect(formatAxisLabel(25)).toBe('25M')
    expect(formatAxisLabel(12.5)).toBe('13M')
    expect(formatAxisLabel(1000)).toBe('1G')
    expect(formatAxisLabel(1250)).toBe('1.3G')
  })

  it('reads a bad rate as zero', () => {
    expect(formatAxisLabel(Number.NaN)).toBe('0')
  })
})
