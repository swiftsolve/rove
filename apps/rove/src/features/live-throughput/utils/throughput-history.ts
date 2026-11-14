import { sanitizeRate } from '@/types'

/** The chart's window: one minute at one sample per second. */
export const CHART_WINDOW_SAMPLES = 60

/**
 * Thirty-two samples more than the window: the two the chart draws past its
 * right edge, and thirty before its left edge for the curve and averaging to
 * reach back over. The adaptive average carries every earlier sample, fading
 * as it goes, so by then a sample leaving moves that edge by well under 1%.
 */
export const THROUGHPUT_HISTORY_LENGTH = CHART_WINDOW_SAMPLES + 32

/** The chart's left-edge label: how far back the window reaches. */
export const CHART_WINDOW_LABEL = `${CHART_WINDOW_SAMPLES}s ago`

export type ThroughputHistory = {
  download: number[]
  upload: number[]
}

export const EMPTY_THROUGHPUT_HISTORY: ThroughputHistory = {
  download: [],
  upload: [],
}

function appendSample(samples: number[], value: number): number[] {
  const next = [...samples, sanitizeRate(value)]
  if (next.length > THROUGHPUT_HISTORY_LENGTH) {
    return next.slice(next.length - THROUGHPUT_HISTORY_LENGTH)
  }
  return next
}

export function appendThroughputHistory(
  history: ThroughputHistory,
  downloadMbps: number,
  uploadMbps: number,
): ThroughputHistory {
  return {
    download: appendSample(history.download, downloadMbps),
    upload: appendSample(history.upload, uploadMbps),
  }
}
