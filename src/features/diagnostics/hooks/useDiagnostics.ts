import { useCallback } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import type { LiveDiagnostics, NetworkDiagnostics } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import { useNetworkKey } from '@/app/hooks/useNetworkKey'

// The live metrics (gateway latency + internet status) refresh on this
// tight cadence so the Connection view's numbers stay current. The heavier full
// run — ISP geolocation and SNMP router identity — is NOT polled; it only runs
// on tab open and network change, so an external lookup isn't hit every poll.
const LIVE_POLL_INTERVAL_MS = 15_000

const ERROR_MESSAGE = 'Couldn’t check your connection'

type UseDiagnosticsResult = {
  diagnostics: NetworkDiagnostics | null
  isRunning: boolean
  error: string | null
  run: () => Promise<void>
}

// Overlay the live metrics on the last full snapshot. Once a live reading has
// landed it owns latency wholesale (a null ping means "unreachable", which must
// win over the full run's stale value); until then the full run's own initial
// reading shows, so nothing flashes empty on open.
function overlayLiveMetrics(full: NetworkDiagnostics | null, live: LiveDiagnostics | null): NetworkDiagnostics | null {
  if (full == null) return null
  if (live == null) return full
  return { ...full, gatewayPing: live.gatewayPing, internet: live.internet }
}

/**
 * The Connection view's diagnostics: a full snapshot fetched on open and on
 * network change, with the cheap live metrics polled on top of it. Both are
 * keyed by network and wait for it to be known.
 */
export function useDiagnostics(): UseDiagnosticsResult {
  const api = window.networkAPI
  const networkKey = useNetworkKey()

  // Full snapshot: identity (gateway, DNS, vendor, model) + ISP. Fetched on
  // open and whenever the network switches — never on the poll interval.
  const full = useBackendQuery({
    queryKey: ['diagnostics', 'snapshot', networkKey],
    queryFn: api ? () => api.runDiagnostics() : undefined,
    isEnabled: networkKey != null,
    errorMessage: ERROR_MESSAGE,
  })

  // Live metrics, refreshed every 15s. Poll-only: the full run above already
  // probes the gateway for the initial paint, so live must NOT fetch on open too
  // — that was probing the target twice on each visit. It starts as null (so it
  // never loads on open), never goes stale (so nothing but the poll, the
  // window being shown again and `run()` refetches it), and takes over once its
  // first reading lands.
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
  // Manual refresh re-runs both so the overlaid live metrics don't linger stale
  // over the freshly-probed full snapshot. A genuine network switch is handled
  // by the network key (full refetches, live starts over) — we do NOT re-run on
  // raw `network-changed` nudges, which macOS' route monitor emits for
  // transient routing churn and which turned into a probe storm.
  const run = useCallback(async (): Promise<void> => {
    await Promise.all([reloadFull(), api ? refetchLive() : undefined])
  }, [api, reloadFull, refetchLive])

  // Hidden while the first snapshot loads, like the snapshot's own error. A
  // rerun keeps it until it lands, so the banner can show its Retry running.
  const isFirstLoad = full.isBusy && full.data === undefined
  const liveError =
    isFirstLoad || live.error == null ? null : live.error instanceof Error ? live.error.message : ERROR_MESSAGE

  return {
    diagnostics: overlayLiveMetrics(full.data ?? null, live.data ?? null),
    isRunning: full.isBusy,
    error: full.error ?? liveError,
    run,
  }
}
