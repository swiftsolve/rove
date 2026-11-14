import type { LatencySample } from '@/features/services/utils/service-latency'
import { type LatencyBand, latencyBand } from '@/features/services/utils/service-status'
import { formatCount, formatLatencyMs } from '@/utils/format'

// Keeps the stroke and dots off the top and bottom edges. No horizontal inset:
// the line runs edge to edge to align with the text around it, and the svg
// doesn't clip, so caps and dots may overhang slightly.
export const VERTICAL_PAD = 3

/** A sample placed on the chart. */
export type Point = {
  x: number
  y: number
  sample: LatencySample
}

/** Health band for a latency, matching the numeric readout's colour thresholds. */
export function chartStatus(ms: number | null): LatencyBand {
  if (ms === null) return 'negative'
  return latencyBand(ms)
}

/** An SVG `points` list. */
export function toSvgPoints(run: Point[]): string {
  return run.map((p) => `${p.x},${p.y}`).join(' ')
}

/** Each sample's place in a `width` × `height` chart; a failed one sits on the baseline. */
export function placePoints(
  samples: LatencySample[],
  width: number,
  height: number,
  slots: number | undefined,
): Point[] {
  const sampleCount = samples.length
  const innerHeight = height - VERTICAL_PAD * 2
  const slotCount = Math.max(slots ?? sampleCount, sampleCount)

  // Scaled over the observed range, so small swings still show.
  const latencies = samples.map((s) => s.ms).filter((ms): ms is number => ms !== null)
  const min = latencies.length > 0 ? Math.min(...latencies) : 0
  const max = latencies.length > 0 ? Math.max(...latencies) : 1
  const isFlat = max === min

  // Right-aligned, leaving the unfilled part of the window blank.
  const xAt = (i: number): number => {
    if (slotCount <= 1) return width
    const slot = slotCount - sampleCount + i
    return (slot / (slotCount - 1)) * width
  }
  const yAt = (ms: number): number => {
    // Identical latencies have no range to scale over, so they sit on the midline.
    if (isFlat) return VERTICAL_PAD + innerHeight / 2
    const shareOfRange = (ms - min) / (max - min)
    return VERTICAL_PAD + innerHeight - shareOfRange * innerHeight
  }

  return samples.map((sample, i) => ({
    x: xAt(i),
    y: sample.ms === null ? height - VERTICAL_PAD : yAt(sample.ms),
    sample,
  }))
}

/** Consecutive reachable points: never empty. */
export type Run = [Point, ...Point[]]

/** Split at failed samples, which leave a gap rather than a dive to the baseline and back. */
export function splitIntoRuns(points: Point[]): Run[] {
  const runs: Run[] = []
  let run: Run | null = null
  for (const point of points) {
    if (point.sample.ms === null) {
      run = null
    } else if (run) {
      run.push(point)
    } else {
      run = [point]
      runs.push(run)
    }
  }
  return runs
}

/** The fill under a run: the run, then down to `baseline` and back. */
export function areaPoints(run: Run, baseline: number): string {
  const firstX = run[0].x
  const lastX = (run.at(-1) ?? run[0]).x
  return `${toSvgPoints(run)} ${lastX},${baseline} ${firstX},${baseline}`
}

/**
 * The chart's spoken summary: how many checks it spans, their latency range and
 * how many failed, e.g. "GitHub latency over the last 24 checks: 18.2 ms to
 * 42.0 ms, 1 failed".
 */
export function chartDescription(samples: LatencySample[], label: string | undefined): string {
  const subject = label ? `${label} latency` : 'Latency'
  const checks = formatCount(samples.length, 'check')
  const latencies = samples.map((s) => s.ms).filter((ms): ms is number => ms !== null)
  const failedCount = samples.length - latencies.length
  const facts: string[] = []
  if (latencies.length > 0) {
    const min = Math.min(...latencies)
    const max = Math.max(...latencies)
    const minText = formatLatencyMs(min) ?? 'unknown'
    const maxText = formatLatencyMs(max) ?? 'unknown'
    facts.push(min === max ? minText : `${minText} to ${maxText}`)
  }
  if (failedCount > 0) facts.push(`${failedCount} failed`)
  return `${subject} over the last ${checks}: ${facts.join(', ')}`
}

/** The index of the point nearest `x`, for the hover cursor. */
export function nearestPointIndex(points: Point[], x: number): number {
  let nearestIndex = 0
  let bestDistance = Infinity
  points.forEach((point, i) => {
    const distance = Math.abs(point.x - x)
    if (distance < bestDistance) {
      bestDistance = distance
      nearestIndex = i
    }
  })
  return nearestIndex
}
