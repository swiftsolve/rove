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
   * couldn't be resolved (helpers/daemons, or a non-macOS platform) — the row
   * then falls back to a favicon/monogram.
   */
  icon: string | null
}

export type AppUsageSummary = {
  /** Per-app totals, busiest first. Empty before the first sample. */
  apps: AppUsage[]
  /**
   * `'supported'` where per-app metering works (Linux, macOS), or
   * `'unsupported'` where it needs a facility Rove doesn't yet drive
   * (Windows/ETW) — the view shows an explanatory note rather than a bare list.
   */
  support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  trackingSince: number | null
}

export function createEmptyAppUsage(): AppUsageSummary {
  return { apps: [], support: 'supported', trackingSince: null }
}
