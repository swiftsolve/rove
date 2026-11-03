import { sanitizeRate } from '@/types'

/** One minute of history at one sample per second. */
const THROUGHPUT_HISTORY_LENGTH = 60

/** The chart's left-edge label: how far back the history reaches. */
export const CHART_WINDOW_LABEL = `${THROUGHPUT_HISTORY_LENGTH}s ago`

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
