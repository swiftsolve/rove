import type { AppUsageSupport } from './app-usage'

/**
 * One kind of traffic: the session's connections bucketed by remote (service)
 * port. Mirrors the backend `TrafficType`.
 */
export type TrafficType = {
  /**
   * Stable classification slug (`'https'`, `'dns'`, `'ssh'`, `'other'`, …).
   * The view keys its icon off this.
   */
  id: string
  /** Display name for the bucket (`'HTTPS'`, `'DNS'`, …). */
  label: string
  rxBytes: number
  txBytes: number
}

/**
 * Traffic by kind for the Traffic Types view. The same samples as
 * `HostUsageSummary`, bucketed by service port instead of peer IP.
 */
export type TrafficUsageSummary = {
  /** Per-kind totals, busiest first. Empty before the first sample. */
  types: TrafficType[]
  /**
   * `'supported'` where per-connection metering works (Linux, macOS), or
   * `'unsupported'` where the source carries no peer port (Windows/ETW).
   */
  support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  trackingSince: number | null
}

export function createEmptyTrafficUsage(): TrafficUsageSummary {
  return { types: [], support: 'supported', trackingSince: null }
}
