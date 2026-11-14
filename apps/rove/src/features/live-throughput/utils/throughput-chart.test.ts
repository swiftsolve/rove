import { describe, expect, it } from 'vitest'

import {
  buildTrace,
  curveHeights,
  firstPointX,
  formatAxisLabel,
  headMbps,
  inViewHeights,
  plotY,
  slotWidth,
  smoothHeights,
} from './throughput-chart'
import { THROUGHPUT_HISTORY_LENGTH } from './throughput-history'

const SIZE = { width: 590, height: 72 }
const SLOT = slotWidth(SIZE.width)

describe('firstPointX', () => {
  it('puts the newest of the points two slots past the right edge', () => {
    const count = 7
    expect(firstPointX(count, SIZE.width) + (count - 1) * SLOT).toBeCloseTo(SIZE.width + 2 * SLOT)
  })

  it('reaches past the left edge once the history is full', () => {
    expect(firstPointX(THROUGHPUT_HISTORY_LENGTH, SIZE.width)).toBeLessThan(-SLOT)
  })
})

describe('curveHeights', () => {
  it('starts a short history from two zeros, with each end repeated', () => {
    const heights = curveHeights([40])
    expect(heights).toHaveLength(5)
    expect(heights[0]).toBe(0)
    expect(heights.at(-1)).toBe(heights.at(-2))
  })

  it('has none before the first sample', () => {
    expect(curveHeights([])).toEqual([])
  })
})

describe('inViewHeights', () => {
  it('keeps a burst while it is in view and drops it once it has scrolled off', () => {
    const quiet = Array<number>(THROUGHPUT_HISTORY_LENGTH).fill(1)
    const inView = [...quiet.slice(0, -30), 80, ...quiet.slice(-29)]
    const gone = [...quiet.slice(0, 5), 80, ...quiet.slice(6)]
    expect(Math.max(...inViewHeights(inView))).toBeGreaterThan(20)
    expect(Math.max(...inViewHeights(gone))).toBeLessThan(1.1)
  })
})

describe('smoothHeights', () => {
  it('leaves a level run level', () => {
    expect(smoothHeights([5, 5, 5]).map((rate) => Math.round(rate * 1000) / 1000)).toEqual([5, 5, 5])
  })

  it('follows a real jump within a few seconds', () => {
    const smoothed = smoothHeights([...Array<number>(10).fill(0.5), ...Array<number>(10).fill(50)])
    expect(smoothed[12]).toBeGreaterThan(25)
    expect(smoothed[14]).toBeGreaterThan(45)
    expect(smoothed[16]).toBeGreaterThan(49)
  })

  it('irons out second-to-second jitter on a steady rate', () => {
    const jittery = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 40 : 50))
    const tail = smoothHeights(jittery).slice(-10)
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1.5)
  })

  it('never moves a point when later samples land', () => {
    const before = smoothHeights([3, 9, 2, 7])
    expect(smoothHeights([3, 9, 2, 7, 40, 0]).slice(0, 4)).toEqual(before)
  })
})

describe('buildTrace', () => {
  const frame = (samples: number[]) => buildTrace(samples, SIZE, 80)

  it('closes the area along the baseline', () => {
    const round = (value: number): number => Math.round(value * 100) / 100
    expect(frame([40])?.area.endsWith(`L${round(SIZE.width + 2 * SLOT)},72L${round(SIZE.width)},72Z`)).toBe(true)
  })

  it('never dips below the baseline or rises above the highest sample', () => {
    const trace = frame([0, 80, 0, 0, 0, 80, 0, 0, 0])
    const ys = (trace?.line.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => Number(pair.split(',')[1]))
    expect(Math.max(...ys)).toBeLessThanOrEqual(72)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
  })

  it('keeps the line behind the head as it was when a sample lands', () => {
    const curves = (trace: ReturnType<typeof frame>, shiftX: number): string[] =>
      (trace?.line.split('C').slice(1) ?? []).map((curve) =>
        curve.replace(/(-?[\d.]+),/g, (_, x: string) => `${(Number(x) + shiftX).toFixed(1)},`),
      )
    // The new layout sits a slot further left; the scroll's step back puts it where it was.
    const before = curves(frame([20, 60, 30]), -SLOT)
    const after = curves(frame([20, 60, 30, 90]), 0)
    // Only the curve into the newest sample, out past the edge, changes.
    expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, -1))
  })

  it('draws nothing before the first sample', () => {
    expect(frame([])).toBeNull()
  })
})

describe('headMbps', () => {
  it('reads the same rate as a sample lands as just before it did', () => {
    expect(headMbps([20, 60, 10], 0)).toBeCloseTo(headMbps([20, 60], 1))
  })

  it('reads a steady rate exactly once the averaging has caught up', () => {
    expect(headMbps(Array<number>(40).fill(42), 0.5)).toBeCloseTo(42)
  })
})

describe('plotY', () => {
  it('puts zero on the baseline and the scale’s top at the top', () => {
    expect(plotY(0, 72, 80)).toBe(72)
    expect(plotY(80, 72, 80)).toBe(0)
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
    expect(formatAxisLabel(999.6)).toBe('1G')
  })

  it('reads a bad rate as zero', () => {
    expect(formatAxisLabel(Number.NaN)).toBe('0')
  })
})
