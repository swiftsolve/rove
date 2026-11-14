import { sanitizeRate } from '@/types'

const MIN_SCALE_MBPS = 10
/** Room above the peak, so the trace never touches the top of the chart. */
const HEADROOM = 1.2
/** Readable axis maxima; above the last one the scale rounds up to the next 1000. */
const NICE_SCALE_STEPS_MBPS = [10, 25, 50, 100, 250, 500, 1000, 1500, 2500, 5000]

type ResolveChartScaleOptions = {
  linkCapacityMbps?: number | null
}

/** Snap scale to readable axis steps so labels do not flicker. */
function roundNiceScale(mbps: number): number {
  const safe = Math.max(MIN_SCALE_MBPS, mbps)
  const step = NICE_SCALE_STEPS_MBPS.find((candidate) => safe <= candidate)
  return step ?? Math.ceil(safe / 1000) * 1000
}

/**
 * The highest of the rates passed in. Callers pass the heights of the line
 * in view, so nothing drawn is cut off and a burst leaves the scale as it
 * scrolls out on the left.
 */
function trafficPeak(download: readonly number[], upload: readonly number[]): number {
  let peak = 0
  for (const mbps of [...download, ...upload]) peak = Math.max(peak, sanitizeRate(mbps))
  return peak
}

/**
 * Y-axis max from the rates on the chart (`download` and `upload`, Mbps),
 * never jumping to full link speed on light traffic. A speed test gets no
 * head start: the axis grows with its traffic, as for any other burst.
 */
export function resolveChartScale(
  download: readonly number[],
  upload: readonly number[],
  options: ResolveChartScaleOptions = {},
): number {
  const { linkCapacityMbps } = options
  const hasLink = linkCapacityMbps != null && linkCapacityMbps > 0
  const linkScale = hasLink ? roundNiceScale(linkCapacityMbps) : null
  const peak = trafficPeak(download, upload)

  const trafficScale = roundNiceScale(Math.max(peak * HEADROOM, MIN_SCALE_MBPS))

  if (linkScale != null) {
    return Math.min(linkScale, trafficScale)
  }

  return trafficScale
}
