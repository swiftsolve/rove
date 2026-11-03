import type { AppUsageSupport } from './app-usage'

/** One remote host an app has exchanged bytes with this session. */
export type HostConn = {
  /** Remote peer IP (no port): the stable grouping key for the host. */
  ip: string
  /**
   * Reverse-DNS hostname, or null until it resolves in the background (or when
   * the peer has no PTR record). The row then shows the bare IP.
   */
  host: string | null
  /**
   * ISO 3166 alpha-2 country code (e.g. "US"), or null (no flag) until
   * geolocation resolves, for a LAN peer, or when the lookup fails.
   */
  countryCode: string | null
  rxBytes: number
  txBytes: number
}

/** One app with the remote hosts it has talked to, busiest host first. */
export type AppHosts = {
  name: string
  /** The app's real OS icon (`data:` URI) or null; see `AppUsage.icon`. */
  icon: string | null
  /** Sum across the app's hosts (TCP-connection traffic only). */
  rxBytes: number
  txBytes: number
  hosts: HostConn[]
}

/** Per-app remote-host breakdown for the Hosts view. Mirrors `AppUsageSummary`. */
export type HostUsageSummary = {
  /** Per-app host breakdown, busiest app first. Empty before the first sample. */
  apps: AppHosts[]
  /**
   * `'supported'` where per-host attribution works (Linux, macOS), or
   * `'unsupported'` where the source carries no peer address (Windows/ETW).
   */
  support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  trackingSince: number | null
}

export function createEmptyHostUsage(): HostUsageSummary {
  return { apps: [], support: 'supported', trackingSince: null }
}
