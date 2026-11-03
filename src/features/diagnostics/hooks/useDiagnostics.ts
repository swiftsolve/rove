import { skipToken, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { overlayLiveMetrics } from '@/features/diagnostics/utils/live-metrics'
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

/**
 * The Connection view's diagnostics: a full snapshot fetched on open and on
 * network change, with the cheap live metrics polled on top of it. Both are
 * keyed by network and wait for it to be known.
 */
export function useDiagnostics(): UseDiagnosticsResult {
  const api = window.networkAPI
  const networkKey = useNetworkKey()

  const full = useBackendQuery({
    queryKey: ['diagnostics', 'snapshot', networkKey],
    queryFn: api ? () => api.runDiagnostics() : undefined,
    isEnabled: networkKey != null,
    errorMessage: ERROR_MESSAGE,
  })

  // Poll-only: the full run already probes the gateway on open, so null initial
  // data and an infinite stale time keep live from probing it a second time.
  const live = useQuery<LiveDiagnostics | null>({
    queryKey: ['diagnostics', 'live', networkKey],
    queryFn: api ? () => api.runDiagnosticsLive() : skipToken,
    enabled: networkKey != null,
    initialData: null,
    staleTime: Infinity,
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
  })

  const { reload: reloadFull } = full
  const { refetch: refetchLive } = live
  // Re-runs both so stale live metrics don't sit over a fresh snapshot. Not run on
  // `network-changed` nudges: macOS emits them for routing churn (a probe storm).
  const run = useCallback(async (): Promise<void> => {
    await Promise.all([reloadFull(), api ? refetchLive() : undefined])
  }, [api, reloadFull, refetchLive])

  // Hidden while the first snapshot loads, like the snapshot's own error. A
  // rerun keeps it until it lands, so the banner can show its Retry running.
  const isFirstLoad = full.isBusy && full.data === undefined
  const liveError =
    isFirstLoad || live.error == null ? null : live.error instanceof Error ? live.error.message : ERROR_MESSAGE

  return {
    diagnostics: overlayLiveMetrics(
      { data: full.data ?? null, updatedAt: full.dataUpdatedAt },
      { data: live.data ?? null, updatedAt: live.dataUpdatedAt },
    ),
    isRunning: full.isBusy,
    error: full.error ?? liveError,
    run,
  }
}
