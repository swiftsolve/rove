/** Bytes transferred during one calendar day (local time). */
export type DailyUsage = {
  /** Local date key, e.g. "2026-07-03". */
  date: string
  rxBytes: number
  txBytes: number
}

export type DataUsageSummary = {
  /** Last 7 calendar days including today, oldest first. Days with no data are zero-filled. */
  days: DailyUsage[]
  /** Cumulative bytes since boot, read directly from kernel interface counters. */
  bootRxBytes: number
  bootTxBytes: number
  /** Epoch ms of the first sample ever recorded, or null before the first sample. */
  trackingSince: number | null
}

/** Today's totals: the last of `days`. Undefined before the first load. */
export function todaysUsage(usage: DataUsageSummary): DailyUsage | undefined {
  return usage.days.at(-1)
}
