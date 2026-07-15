import type { ServicesReport } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// The Services view's probe cadence — matches the old diagnostics live poll, so
// the sparklines and timeline accrue at the same rate they did when this rode on
// the Connection diagnostics.
const SERVICE_POLL_INTERVAL_MS = 15_000

interface UseServiceReachabilityResult {
  /** The latest probe set, or null before the first read lands. */
  readonly report: ServicesReport | null
  readonly error: string | null
  /** Re-probe now, ahead of the poll — used after a service is added or removed
   *  so the changed row's latency lands immediately. */
  readonly run: () => Promise<void>
}

/**
 * Service reachability + the internet context to read it, on its own poll —
 * deliberately independent of `useDiagnostics`, so opening the Connection view
 * no longer probes the user's services (and vice versa). Fetches on enable and
 * every {@link SERVICE_POLL_INTERVAL_MS} while the Services tab is open; paused
 * while hidden, one fresh read on resume. `networkKey` invalidates the cache on
 * a real network switch so stale results never linger across networks.
 */
export function useServiceReachability(
  enabled: boolean,
  networkKey?: string | null,
): UseServiceReachabilityResult {
  const resource = useBackendResource(
    window.networkAPI?.runServices,
    enabled,
    'Service check failed',
    { resetKey: networkKey, pollIntervalMs: SERVICE_POLL_INTERVAL_MS },
  )

  return {
    report: resource.data,
    error: resource.error,
    run: resource.reload,
  }
}
