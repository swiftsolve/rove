import type { AppUsageSupport } from './app-usage'

/** One remote host an app has exchanged bytes with this session. */
export interface HostConn {
  /** Remote peer IP (no port) — the stable grouping key for the host. */
  readonly ip: string
  /**
   * Reverse-DNS hostname, or null until it resolves in the background (or when
   * the peer has no PTR record) — the row then shows the bare IP.
   */
  readonly host: string | null
  /**
   * ISO-3166 alpha-2 country code (e.g. "US"), or null until geolocation
   * resolves, for a private/LAN peer, or when the lookup fails — no flag shown.
   */
  readonly countryCode: string | null
  readonly rxBytes: number
  readonly txBytes: number
}

/** One app with the remote hosts it has talked to, busiest host first. */
export interface AppHosts {
  readonly name: string
  /** The app's real OS icon (`data:` URI) or null — see `AppUsage.icon`. */
  readonly icon: string | null
  /** Sum across the app's hosts (TCP-connection traffic only). */
  readonly rxBytes: number
  readonly txBytes: number
  readonly hosts: readonly HostConn[]
}

/** Per-app remote-host breakdown for the Hosts view. Mirrors `AppUsageSummary`. */
export interface HostUsageSummary {
  /** Per-app host breakdown, busiest app first. Empty before the first sample. */
  readonly apps: readonly AppHosts[]
  /**
   * `'supported'` where per-host attribution works (Linux, macOS), or
   * `'unsupported'` where the source carries no peer address (Windows/ETW).
   */
  readonly support: AppUsageSupport
  /** Epoch ms of the first sample, or null before then. */
  readonly trackingSince: number | null
}

export function createEmptyHostUsage(): HostUsageSummary {
  return { apps: [], support: 'supported', trackingSince: null }
}
