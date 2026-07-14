/** Whether per-app usage metering is available on this OS. */
export type AppUsageSupport = 'supported' | 'unsupported'

/** One application's network usage since Rove started watching. */
export interface AppUsage {
  /** Process name; all processes sharing it are summed together. */
  readonly name: string
  readonly rxBytes: number
  readonly txBytes: number
}

export interface AppUsageSummary {
  /** Per-app totals, busiest first. Empty before the first sample. */
  readonly apps: readonly AppUsage[]
  /**
   * `'supported'` where per-app metering works (Linux, macOS), or
   * `'unsupported'` where it needs a facility Rove doesn't yet drive
   * (Windows/ETW) — the view shows an explanatory note rather than a bare list.
   */
  readonly support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  readonly trackingSince: number | null
}

export function createEmptyAppUsage(): AppUsageSummary {
  return { apps: [], support: 'supported', trackingSince: null }
}
