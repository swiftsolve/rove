/** Bytes transferred during one calendar day (local time). */
export interface DailyUsage {
  /** Local date key, e.g. "2026-07-03". */
  readonly date: string
  readonly rxBytes: number
  readonly txBytes: number
}

export interface DataUsageSummary {
  /** Last 7 calendar days including today, oldest first. Days with no data are zero-filled. */
  readonly days: readonly DailyUsage[]
  /** Cumulative bytes since boot, read directly from kernel interface counters. */
  readonly bootRxBytes: number
  readonly bootTxBytes: number
  /** Epoch ms of the first sample ever recorded, or null before the first sample. */
  readonly trackingSince: number | null
}

export function createEmptyDataUsage(): DataUsageSummary {
  return { days: [], bootRxBytes: 0, bootTxBytes: 0, trackingSince: null }
}
