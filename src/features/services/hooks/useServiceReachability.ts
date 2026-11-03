import { useEffect, useRef } from 'react'
import type { NetworkAPI, ServicesReport } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { useInternetStatus } from '@/app/hooks/useInternetStatus'
import { recordLatency } from '@/features/services/utils/service-latency'

// The Services view's probe cadence — the same as the Connection view's live
// poll, so the sparklines keep the rate they had when services rode on it.
const SERVICE_POLL_INTERVAL_MS = 15_000

interface UseServiceReachabilityResult {
  /** The latest probe set, or null before the first read lands. */
  report: ServicesReport | null
  error: string | null
  /** Re-probe now, ahead of the poll — used after a service is added or removed
   *  so the changed row's latency lands immediately. */
  run: () => Promise<void>
}

async function probeServices(api: NetworkAPI): Promise<ServicesReport> {
  const report = await api.runServices()
  // Record per-host latency from each probe so the Services page sparklines
  // accrue while the tab is open. Done here, once per batch, rather than in an
  // effect, which would record a batch again each time a Services screen mounts.
  // The outage *timeline* is not recorded here — that's the backend heartbeat's
  // job (see `spawn_services_heartbeat`), so it keeps accruing with this tab,
  // and the window, closed.
  //
  // The batch's internet status goes along: when this machine is offline every
  // service probe fails at once, which isn't the services' fault. It's paired
  // with the probes from the same batch (see `ServicesReport`) so the two never
  // disagree about that window.
  recordLatency(report.services, report.internet)
  return report
}

/**
 * Service reachability + the internet context to read it, on its own poll —
 * deliberately independent of `useDiagnostics`, so opening the Connection view
 * no longer probes the user's services (and vice versa). Fetches when the
 * Services tab opens and every {@link SERVICE_POLL_INTERVAL_MS} while it's open;
 * paused while hidden, one fresh read on resume. Keyed by network (and waiting
 * for it), so stale results never linger across networks.
 *
 * When the live internet status flips, the services are re-probed right away
 * (see below).
 */
export function useServiceReachability(): UseServiceReachabilityResult {
  const api = window.networkAPI
  const networkKey = useNetworkKey()
  const internet = useInternetStatus()
  const isEnabled = networkKey != null

  const {
    data,
    error,
    reload: run,
  } = useBackendQuery({
    queryKey: ['services', 'reachability', networkKey],
    queryFn: api ? () => probeServices(api) : undefined,
    isEnabled,
    errorMessage: 'Service check failed',
    pollIntervalMs: SERVICE_POLL_INTERVAL_MS,
  })

  // When the live internet status flips (lost or restored), re-probe right away
  // rather than waiting out the poll, so the rows catch up with the header and
  // title bar within a second instead of showing the previous batch's verdict.
  // The first verdict after launch isn't a flip — the tab's own fetch covers it.
  const lastInternetRef = useRef(internet)
  useEffect(() => {
    const previous = lastInternetRef.current
    lastInternetRef.current = internet
    if (isEnabled && previous !== null && previous !== internet) void run()
  }, [internet, isEnabled, run])

  return { report: data ?? null, error, run }
}
