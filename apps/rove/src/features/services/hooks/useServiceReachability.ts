import { useEffect, useRef } from 'react'

import { useInternetStatus } from '@/app/hooks/useInternetStatus'
import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { recordLatency } from '@/features/services/utils/service-latency'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { NetworkAPI, ServicesReport } from '@/types'

/**
 * Matches the Connection view's live poll, which services used to ride on, so
 * the sparklines keep their rate.
 */
const SERVICE_POLL_INTERVAL_MS = 15_000

type UseServiceReachabilityResult = {
  /**
   * The latest probe set: the backend's last batch until this view's own probe
   * lands, or null when there's neither.
   */
  report: ServicesReport | null
  /** The backend's last batch is still being read, so a null `report` may not stay null. */
  isReadingLastReport: boolean
  error: string | null
  /** Re-probe now, ahead of the poll, so a just-changed row's latency lands at once. */
  reprobe: () => Promise<void>
}

async function probeServices(api: NetworkAPI): Promise<ServicesReport> {
  const report = await api.runServices()
  // Recorded here, once per batch, not in an effect, which would record a batch
  // again each time a Services screen mounts. The batch's own internet status
  // goes along so offline failures aren't blamed on the services. The outage
  // timeline is the backend heartbeat's (`spawn_services_heartbeat`).
  recordLatency(report.services, report.internet)
  return report
}

/**
 * Service reachability and the internet status to read it by, on its own poll,
 * independent of `useDiagnostics` so the Connection view doesn't probe the user's
 * services. Polls every {@link SERVICE_POLL_INTERVAL_MS} while the tab is open,
 * paused while hidden. Keyed by network, so results never linger across networks.
 */
export function useServiceReachability(): UseServiceReachabilityResult {
  const api = window.networkAPI
  const networkKey = useNetworkKey()
  const internet = useInternetStatus()
  const isEnabled = networkKey != null

  const {
    data,
    error,
    reload: reprobe,
  } = useBackendQuery({
    queryKey: ['services', 'reachability', networkKey],
    queryFn: api ? () => probeServices(api) : undefined,
    isEnabled,
    errorMessage: 'Service check failed',
    pollIntervalMs: SERVICE_POLL_INTERVAL_MS,
  })

  // The backend's last batch for this network, the heartbeat's or an earlier
  // view's, so a first open shows the rows' numbers and the tally at once
  // instead of waiting out the probe. Never recorded as latency: it was already.
  const { data: lastReport, isBusy: isLastReportBusy } = useBackendQuery({
    queryKey: ['services', 'last-report', networkKey],
    queryFn: api && networkKey ? () => api.getLastServicesReport(networkKey) : undefined,
    isEnabled,
    errorMessage: 'Service check failed',
  })

  // Re-probe when the live internet status flips, so the rows catch up with the
  // title bar instead of showing the last batch's verdict. The first verdict
  // after launch isn't a flip: the tab's own fetch covers it.
  const lastInternetRef = useRef(internet)
  useEffect(() => {
    const previous = lastInternetRef.current
    lastInternetRef.current = internet
    if (isEnabled && previous !== null && previous !== internet) void reprobe()
  }, [internet, isEnabled, reprobe])

  const report = data ?? lastReport ?? null
  return { report, isReadingLastReport: report === null && isLastReportBusy, error, reprobe }
}
