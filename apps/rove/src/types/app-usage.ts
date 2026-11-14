/** Whether per-app usage metering is available on this OS. */
export type AppUsageSupport = 'supported' | 'unsupported'

/** One application's network usage since Rove started watching. */
export type AppUsage = {
  /** Process name; all processes sharing it are summed together. */
  name: string
  rxBytes: number
  txBytes: number
  /**
   * `data:image/png;base64,…` of the app's real OS icon (macOS), or null when it
   * couldn't be resolved (helpers, daemons, other platforms). The row then
   * falls back to a favicon or monogram.
   */
  icon: string | null
}

export type AppUsageSummary = {
  /** Per-app totals, busiest first. Empty before the first sample. */
  apps: AppUsage[]
  /**
   * `'supported'` where per-app metering works: Linux, macOS, and Windows once
   * its ETW session is up (it needs administrator).
   */
  support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  trackingSince: number | null
}
