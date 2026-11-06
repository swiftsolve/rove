import { isWifiNetwork, type NetworkInfo, sanitizeRate, type SpeedHistoryEntry } from '@/types'

const MIN_SCALE_MBPS = 10
/** Room above the peak, so the trace never touches the top of the chart. */
const HEADROOM = 1.2
/** Samples (one a second) the peak is taken over. */
const RECENT_PEAK_WINDOW = 20
/** Short tail window: when it stays well below the longer peak, traffic has settled. */
const TAIL_PEAK_WINDOW = 5
const SETTLED_RATIO = 0.25
/** Readable axis maxima; above the last one the scale rounds up to the next 1000. */
const NICE_SCALE_STEPS_MBPS = [10, 25, 50, 100, 250, 500, 1000, 1500, 2500, 5000]

type ResolveChartScaleOptions = {
  linkCapacityMbps?: number | null
  /** A floor while a speed test downloads: the last result on this network. */
  testFloorMbps?: number | null
}

/** Snap scale to readable axis steps so labels do not flicker. */
function roundNiceScale(mbps: number): number {
  const safe = Math.max(MIN_SCALE_MBPS, mbps)
  const step = NICE_SCALE_STEPS_MBPS.find((candidate) => safe <= candidate)
  return step ?? Math.ceil(safe / 1000) * 1000
}

function peakInWindow(download: number[], upload: number[], window: number): number {
  const count = download.length
  if (count === 0) return 0

  const from = Math.max(0, count - window)
  let peak = 0
  for (let index = from; index < count; index += 1) {
    peak = Math.max(peak, sanitizeRate(download[index] ?? 0), sanitizeRate(upload[index] ?? 0))
  }
  return peak
}

/** Peak for axis scaling; drops stale bursts once recent traffic has settled. */
function trafficPeak(download: number[], upload: number[]): number {
  const recent = peakInWindow(download, upload, RECENT_PEAK_WINDOW)
  if (recent === 0) return 0

  const tail = peakInWindow(download, upload, TAIL_PEAK_WINDOW)
  const current = Math.max(sanitizeRate(download.at(-1) ?? 0), sanitizeRate(upload.at(-1) ?? 0))

  // After a speed test or counter spike the window still holds the burst, so
  // scale to what's on the wire now.
  if (tail < recent * SETTLED_RATIO && current < recent * SETTLED_RATIO) {
    return Math.max(tail, current)
  }

  return recent
}

/**
 * Y-axis max from recent traffic, never jumping to full link speed on light
 * traffic. While a test downloads, the last result is a floor, so the axis
 * doesn't jump as the test ramps up; link speed is no guide, as Wi-Fi's runs
 * far above what a test reaches.
 */
export function resolveChartScale(
  download: number[],
  upload: number[],
  options: ResolveChartScaleOptions = {},
): number {
  const { linkCapacityMbps, testFloorMbps } = options
  const hasLink = linkCapacityMbps != null && linkCapacityMbps > 0
  const linkScale = hasLink ? roundNiceScale(linkCapacityMbps) : null
  const peak = Math.max(trafficPeak(download, upload), sanitizeRate(testFloorMbps ?? 0))

  const trafficScale = roundNiceScale(Math.max(peak * HEADROOM, MIN_SCALE_MBPS))

  if (linkScale != null) {
    return Math.min(linkScale, trafficScale)
  }

  return trafficScale
}

/** The newest result on this network (`entries` newest first), or undefined. */
export function lastResultOn(
  entries: readonly SpeedHistoryEntry[] | undefined,
  info: NetworkInfo | null,
): SpeedHistoryEntry | undefined {
  if (!info) return undefined
  const networkName = isWifiNetwork(info) ? (info.ssid ?? null) : null
  return entries?.find((entry) => entry.connectionType === info.connectionType && entry.networkName === networkName)
}
