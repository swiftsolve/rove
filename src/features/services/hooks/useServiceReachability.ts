import { useEffect, useRef } from 'react'
import type { InternetStatus, ServicesReport } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'
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

/**
 * Service reachability + the internet context to read it, on its own poll —
 * deliberately independent of `useDiagnostics`, so opening the Connection view
 * no longer probes the user's services (and vice versa). Fetches on enable and
 * every {@link SERVICE_POLL_INTERVAL_MS} while the Services tab is open; paused
 * while hidden, one fresh read on resume. `networkKey` invalidates the cache on
 * a real network switch so stale results never linger across networks.
 *
 * `internet` is the live heartbeat verdict: when it flips, the services are
 * re-probed right away (see below).
 */
export function useServiceReachability(
  isEnabled: boolean,
  networkKey: string | null,
  internet: InternetStatus | null,
): UseServiceReachabilityResult {
  const { data: report, error, reload: run } = useBackendResource(
    window.networkAPI?.runServices,
    isEnabled,
    'Service check failed',
    { resetKey: networkKey, pollIntervalMs: SERVICE_POLL_INTERVAL_MS },
  )

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

  // Record per-host latency from each probe so the Services page sparklines
  // accrue while the tab is open. The outage *timeline* is not recorded here —
  // that's the backend heartbeat's job (see `spawn_services_heartbeat`), so it
  // keeps accruing with this tab, and the window, closed.
  //
  // The batch's internet status goes along: when this machine is offline every
  // service probe fails at once, which isn't the services' fault. It's paired
  // with the probes from the same batch (see `ServicesReport`) so the two never
  // disagree about that window.
  const services = report?.services
  const batchInternet = report?.internet
  useEffect(() => {
    if (services) recordLatency(services, batchInternet)
  }, [services, batchInternet])

  return { report, error, run }
}
