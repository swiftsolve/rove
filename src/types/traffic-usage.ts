import type { AppUsageSupport } from './app-usage'

/** One kind of traffic — a protocol bucket the session's connections were
 *  grouped into by their remote (service) port. Mirrors the backend
 *  `TrafficType`. */
export interface TrafficType {
  /** Stable classification slug (`'https'`, `'dns'`, `'ssh'`, `'other'`, …).
   *  The view keys its icon off this. */
  readonly id: string
  /** Display name for the bucket (`'HTTPS'`, `'DNS'`, …). */
  readonly label: string
  readonly rxBytes: number
  readonly txBytes: number
}

/** Traffic broken down by kind for the Traffic Types view — a flat,
 *  busiest-first list. Same coverage as `HostUsageSummary` (grouped from the
 *  same per-connection samples), just bucketed by service port instead of peer
 *  IP. Mirrors the other usage summaries' shape so the frontend treats them
 *  alike. */
export interface TrafficUsageSummary {
  /** Per-kind totals, busiest first. Empty before the first sample. */
  readonly types: readonly TrafficType[]
  /**
   * `'supported'` where per-connection metering works (Linux, macOS), or
   * `'unsupported'` where it needs a facility Rove doesn't yet drive
   * (Windows/ETW) — the view shows an explanatory note rather than a bare list.
   */
  readonly support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  readonly trackingSince: number | null
}

export function createEmptyTrafficUsage(): TrafficUsageSummary {
  return { types: [], support: 'supported', trackingSince: null }
}
