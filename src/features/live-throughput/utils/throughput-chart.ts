import { CHART_WINDOW_SAMPLES, THROUGHPUT_HISTORY_LENGTH } from '@/features/live-throughput/utils/throughput-history'
import { sanitizeRate } from '@/types'

/** The plot area's size (px), inside the chart's margins. */
export type PlotSize = {
  width: number
  height: number
}

/** One series drawn at the chart's current scale and scroll. */
export type Trace = {
  /** The whole line, oldest sample first. */
  line: string
  /** The shaded area under the line, closed along the baseline. */
  area: string
  /** The line's height where it crosses the plot's right edge, for the dot there. */
  headY: number
}

/** The gap between two samples (px): the window's samples span the plot's width. */
export function slotWidth(plotWidth: number): number {
  return plotWidth / (CHART_WINDOW_SAMPLES - 1)
}

/**
 * Where the oldest of `count` points sits (px from the plot's left edge) at a
 * scroll progress of 0. The newest sits two slots past the right edge, and
 * the scroll brings the one before it onto the edge: a curve's shape needs
 * the sample after it, so the line in view has always settled.
 */
export function firstPointX(count: number, plotWidth: number): number {
  const slot = slotWidth(plotWidth)
  return plotWidth + 2 * slot - (count - 1) * slot
}

// An adaptive average, after the One Euro filter (Casiez et al., 2012): it
// follows slowly while the rate holds steady, which irons out jitter, and
// quickly once the rate really moves, so a jump shows within a few seconds.
// The rate of change is measured relative to the rate itself, so a step from
// 1 to 2 Mbps counts as much as one from 100 to 200.
const STEADY_CUTOFF_HZ = 0.05
const CHANGE_CUTOFF_HZ = 0.1
/** How much faster it follows per unit of relative change past the jitter threshold. */
const RESPONSE = 5
/** Relative change per second below which a move is treated as jitter. */
const JITTER_THRESHOLD = 0.2
/** Below this rate (Mbps), changes count against it, so background chatter stays jitter. */
const RATE_FLOOR_MBPS = 0.5
// Then a light binomial bell, which rounds the result into soft hills.
const BELL_WEIGHTS = [1, 4, 6, 4, 1]
const BELL_TOTAL = 16

/** The share of the gap a filter closes each one-second sample, for a cutoff frequency. */
function followShare(cutoffHz: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * cutoffHz))
}

/**
 * Smooths rates (Mbps, oldest first): the adaptive average, then the bell.
 * Only past samples count, so a point never changes once it's drawn.
 */
export function smoothHeights(rates: readonly number[]): number[] {
  let level = rates[0] ?? 0
  let trend = 0
  const followed = rates.map((rate) => {
    trend += followShare(CHANGE_CUTOFF_HZ) * (rate - level - trend)
    const change = Math.abs(trend) / Math.max(level, rate, RATE_FLOOR_MBPS)
    level += followShare(STEADY_CUTOFF_HZ + RESPONSE * Math.max(0, change - JITTER_THRESHOLD)) * (rate - level)
    return level
  })
  return followed.map(
    (_, index) =>
      BELL_WEIGHTS.reduce((sum, weight, back) => sum + weight * (followed[Math.max(0, index - back)] ?? 0), 0) /
      BELL_TOTAL,
  )
}

/**
 * The heights (Mbps) the curve is drawn through, one per point. A history
 * shorter than the stored length starts from two zeros, so its trace rises
 * off the baseline instead of starting in mid-air. The heights are averaged,
 * and each end is repeated a slot so the curve runs level off both edges.
 */
export function curveHeights(samples: readonly number[]): number[] {
  if (samples.length === 0) return []
  const rates = samples.length < THROUGHPUT_HISTORY_LENGTH ? [0, 0, ...samples] : samples
  const smoothed = smoothHeights(rates.map(sanitizeRate))
  return [smoothed[0] ?? 0, ...smoothed, smoothed.at(-1) ?? 0]
}

/**
 * The heights (Mbps) that shape the line in view: the window, the two points
 * past the right edge, and the two before the left edge that the curve's
 * first stretch reaches back to. Every point of the line lies within them.
 */
export function inViewHeights(samples: readonly number[]): number[] {
  return curveHeights(samples).slice(-(CHART_WINDOW_SAMPLES + 4))
}

/** A segment's Bézier start, controls and end, from the four heights around it. */
function segmentHeights(heights: readonly number[], index: number): [number, number, number, number] {
  const [p0, p1, p2, p3] = [
    heights[index] ?? 0,
    heights[index + 1] ?? 0,
    heights[index + 2] ?? 0,
    heights[index + 3] ?? 0,
  ]
  return [(p0 + 4 * p1 + p2) / 6, (2 * p1 + p2) / 3, (p1 + 2 * p2) / 3, (p1 + 4 * p2 + p3) / 6]
}

/** The cubic Bézier through `controls` (start, two controls, end) at `u` (0 to 1). */
function bezierAt(controls: readonly [number, number, number, number], u: number): number {
  const v = 1 - u
  return v * v * v * controls[0] + 3 * v * v * u * controls[1] + 3 * v * u * u * controls[2] + u * u * u * controls[3]
}

/** The line's height (Mbps) at the plot's right edge, from `curveHeights`. */
function headOf(heights: readonly number[], progress: number): number {
  const pointCount = heights.length - 2
  if (pointCount < 2) return 0
  // The edge sits two slots behind the newest point, `progress` of the way to the next.
  const edge = pointCount - 3 + progress
  const segment = Math.min(pointCount - 2, Math.max(0, Math.floor(edge)))
  return bezierAt(segmentHeights(heights, segment), Math.min(1, Math.max(0, edge - segment)))
}

/**
 * The rate (Mbps) where the line meets the plot's right edge, at a scroll
 * `progress` (see `useTraceScroll`): what the "Now" dot shows, so the
 * readouts show it too and agree with the chart.
 */
export function headMbps(samples: readonly number[], progress: number): number {
  return headOf(curveHeights(samples), progress)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Draws one series' line and area at `scaleMax`, scrolled `progress` of a
 * slot (see `useTraceScroll`).
 *
 * The curve is a uniform cubic B-spline over the averaged samples: smooth
 * all the way through, so a burst is a soft hill with no flat top or
 * shoulder, and it never dips below zero. Each stretch is shaped by the
 * samples either side, all of which have landed by the time it's in view,
 * so once drawn it never changes.
 */
export function buildTrace(
  samples: readonly number[],
  size: PlotSize,
  scaleMax: number,
  progress: number,
): Trace | null {
  const heights = curveHeights(samples)
  const pointCount = heights.length - 2
  if (pointCount < 2) return null

  const slot = slotWidth(size.width)
  const firstX = firstPointX(pointCount, size.width)
  const lastX = firstX + (pointCount - 1) * slot
  const toY = (mbps: number): number => (scaleMax > 0 ? size.height * (1 - mbps / scaleMax) : size.height)

  const curves: string[] = []
  for (let index = 0; index < pointCount - 1; index += 1) {
    const x = firstX + index * slot
    const [, c1, c2, end] = segmentHeights(heights, index).map(toY)
    curves.push(
      `C${round(x + slot / 3)},${round(c1 ?? 0)} ${round(x + (2 * slot) / 3)},${round(c2 ?? 0)} ${round(x + slot)},${round(end ?? 0)}`,
    )
  }
  const line = `M${round(firstX)},${round(toY(segmentHeights(heights, 0)[0]))}${curves.join('')}`
  const area = `${line}L${round(lastX)},${size.height}L${round(firstX)},${size.height}Z`

  return { line, area, headY: toY(headOf(heights, progress)) }
}

/** A y-axis label: "0", "25M", "2.5M", "1.2G". */
export function formatAxisLabel(mbps: number): string {
  const safeMbps = sanitizeRate(mbps)
  if (safeMbps === 0) return '0'
  // By the rounded value, so 999.6 reads "1G" rather than a too-wide "1000M".
  if (roundTick(safeMbps) >= 1000) return `${roundTick(safeMbps / 1000)}G`
  return `${roundTick(safeMbps)}M`
}

/** No trailing ".0", and one decimal only below 10, so ticks stay short. */
function roundTick(value: number): number {
  return Number(value.toFixed(value >= 10 ? 0 : 1))
}
