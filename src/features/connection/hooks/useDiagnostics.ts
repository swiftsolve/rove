import { skipToken, useQuery } from '@tanstack/react-query'

import { useNetwork } from '@/app/hooks/useNetwork'
import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { overlayLiveMetrics } from '@/features/connection/utils/live-metrics'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { LiveDiagnostics, NetworkDiagnostics } from '@/types'

// Only the cheap live metrics poll. The full run makes an external ISP lookup,
// so it runs just on open and on network change.
const LIVE_POLL_INTERVAL_MS = 15_000

const ERROR_MESSAGE = 'Couldn’t check your connection'

type UseDiagnosticsResult = {
  diagnostics: NetworkDiagnostics | null
  isRunning: boolean
  error: string | null
  run: () => Promise<void>
}

/** A failed live poll's message, falling back to the generic one when it threw something that isn't an Error. */
function errorText(error: unknown): string | null {
  if (error == null) return null
  return error instanceof Error ? error.message : ERROR_MESSAGE
}

/**
 * The Connection view's diagnostics: a full snapshot fetched on open and on
 * network change, with the cheap live metrics polled on top of it. Both are
 * keyed by network and wait for it to be known.
 */
export function useDiagnostics(): UseDiagnosticsResult {
  const api = window.networkAPI
  const networkKey = useNetworkKey()
  // Off a router there's no gateway to probe or path to the ISP.
  const isConnected = useNetwork().info?.isConnected ?? false
  const canCheck = networkKey != null && isConnected

  const snapshotQuery = useBackendQuery({
    queryKey: ['diagnostics', 'snapshot', networkKey],
    queryFn: api ? () => api.runDiagnostics() : undefined,
    isEnabled: canCheck,
    errorMessage: ERROR_MESSAGE,
  })

  // Poll-only: the full run already probes the gateway on open, so null initial
  // data and an infinite stale time keep live from probing it a second time.
  const liveQuery = useQuery<LiveDiagnostics | null>({
    queryKey: ['diagnostics', 'live', networkKey],
    queryFn: api ? () => api.runDiagnosticsLive() : skipToken,
    enabled: canCheck,
    initialData: null,
    staleTime: Infinity,
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
  })

  // The full run alone: it measures the gateway latency and internet verdict
  // too, and being newer it shows over the last live poll (`overlayLiveMetrics`),
  // so re-polling live would only measure them twice. Not run on
  // `network-changed` nudges: macOS emits them for routing churn (a probe storm).
  const { reload: run } = snapshotQuery

  // Hidden while the first snapshot loads, like the snapshot's own error. A
  // rerun keeps it until it lands, so the banner can show its Retry running.
  const isFirstLoad = snapshotQuery.isBusy && snapshotQuery.data === undefined
  // A full run that landed after a failed poll measured the same things, so the
  // poll's error is out of date.
  const isLiveErrorSuperseded = liveQuery.errorUpdatedAt <= snapshotQuery.dataUpdatedAt
  const liveError = isFirstLoad || isLiveErrorSuperseded ? null : errorText(liveQuery.error)

  return {
    diagnostics: overlayLiveMetrics(
      { data: snapshotQuery.data ?? null, updatedAt: snapshotQuery.dataUpdatedAt },
      { data: liveQuery.data ?? null, updatedAt: liveQuery.dataUpdatedAt },
    ),
    isRunning: snapshotQuery.isBusy,
    error: snapshotQuery.error ?? liveError,
    run,
  }
}
