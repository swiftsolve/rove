import { sanitizeRate } from '@/types'

/** One minute of history at one sample per second. */
export const THROUGHPUT_HISTORY_LENGTH = 60
export const CHART_WINDOW_MS = THROUGHPUT_HISTORY_LENGTH * 1_000

export function formatChartWindowLabel(): string {
  const seconds = CHART_WINDOW_MS / 1000
  if (seconds >= 120 && seconds % 60 === 0) return `−${seconds / 60}m`
  return `−${seconds}s`
}

export interface ThroughputHistory {
  readonly download: readonly number[]
  readonly upload: readonly number[]
}

export const EMPTY_THROUGHPUT_HISTORY: ThroughputHistory = {
  download: [],
  upload: [],
}

function appendSample(samples: readonly number[], value: number): number[] {
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
