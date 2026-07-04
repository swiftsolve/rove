import { sanitizeRate } from '@/types'

const MIN_SCALE_MBPS = 10
const HEADROOM = 1.2
const RECENT_PEAK_WINDOW = 20

/** Snap scale to readable axis steps so labels do not flicker. */
export function roundNiceScale(mbps: number): number {
  const safe = Math.max(MIN_SCALE_MBPS, mbps)

  if (safe <= 10) return 10
  if (safe <= 25) return 25
  if (safe <= 50) return 50
  if (safe <= 100) return 100
  if (safe <= 250) return 250
  if (safe <= 500) return 500
  if (safe <= 1000) return 1000
  if (safe <= 1500) return 1500
  if (safe <= 2500) return 2500
  if (safe <= 5000) return 5000

  return Math.ceil(safe / 1000) * 1000
}

function recentPeak(download: readonly number[], upload: readonly number[]): number {
  const count = download.length
  if (count === 0) return 0

  const from = Math.max(0, count - RECENT_PEAK_WINDOW)
  let peak = 0
  for (let index = from; index < count; index += 1) {
    peak = Math.max(peak, sanitizeRate(download[index] ?? 0), sanitizeRate(upload[index] ?? 0))
  }
  return peak
}

interface ResolveChartScaleOptions {
  readonly linkCapacityMbps?: number | null
  readonly speedTestRunning?: boolean
}

/**
 * Y-axis max from recent traffic. During a speed test, lock to link capacity.
 * Otherwise scale to fit the data — never jump to full link speed on light traffic.
 */
export function resolveChartScale(
  download: readonly number[],
  upload: readonly number[],
  options: ResolveChartScaleOptions = {},
): number {
  const { linkCapacityMbps, speedTestRunning = false } = options
  const hasLink = linkCapacityMbps != null && linkCapacityMbps > 0
  const linkScale = hasLink ? roundNiceScale(linkCapacityMbps) : null
  const recent = recentPeak(download, upload)

  if (speedTestRunning && linkScale != null) {
    return linkScale
  }

  const trafficScale = roundNiceScale(Math.max(recent * HEADROOM, MIN_SCALE_MBPS))

  if (linkScale != null) {
    return Math.min(linkScale, trafficScale)
  }

  return trafficScale
}
