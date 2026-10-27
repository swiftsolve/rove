import { useCallback } from 'react'
import type { LiveDiagnostics, NetworkDiagnostics } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// The live metrics (gateway latency + internet status) refresh on this
// tight cadence so the Connection view's numbers stay current. The heavier full
// run — ISP geolocation and SNMP router identity — is NOT polled; it only runs
// on tab open and network change, so an external lookup isn't hit every poll.
const LIVE_POLL_INTERVAL_MS = 15_000

interface UseDiagnosticsResult {
  diagnostics: NetworkDiagnostics | null
  isRunning: boolean
  error: string | null
  run: () => Promise<void>
}

// Overlay the live metrics on the last full snapshot. Once a live reading has
// landed it owns latency wholesale (a null ping means "unreachable", which must
// win over the full run's stale value); until then the full run's own initial
// reading shows, so nothing flashes empty on open.
function overlayLiveMetrics(
  full: NetworkDiagnostics | null,
  live: LiveDiagnostics | null,
): NetworkDiagnostics | null {
  if (full == null) return null
  if (live == null) return full
  return { ...full, gatewayPing: live.gatewayPing, internet: live.internet }
}

/**
 * The Connection view's diagnostics: a full snapshot fetched on open and on
 * network change, with the cheap live metrics polled on top of it.
 */
export function useDiagnostics(isEnabled: boolean, networkKey?: string | null): UseDiagnosticsResult {
  // Full snapshot: identity (gateway, DNS, vendor, model) + ISP. Fetched on
  // enable and whenever the network switches — never on the poll interval.
  const full = useBackendResource(
    window.networkAPI?.runDiagnostics,
    isEnabled,
    'Diagnostics failed',
    { resetKey: networkKey, shouldRefetchOnEnable: true },
  )

  // Live metrics, refreshed every 15s. Poll-only: the full run above already
  // probes the gateway for the initial paint, so live must NOT fetch on open too
  // — that was probing the target twice on each visit. It just keeps those
  // numbers current on the interval (paused while hidden, one fresh read on
  // resume) and takes over once its first reading lands.
  const live = useBackendResource(
    window.networkAPI?.runDiagnosticsLive,
    isEnabled,
    'Diagnostics failed',
    {
      resetKey: networkKey,
      pollIntervalMs: LIVE_POLL_INTERVAL_MS,
      shouldFetchOnEnable: false,
    },
  )

  const { reload: reloadFull } = full
  const { reload: reloadLive } = live
  // Manual refresh re-runs both so the overlaid live metrics don't linger stale
  // over the freshly-probed full snapshot. A genuine network switch is handled
  // by `resetKey: networkKey` (full refetches, live re-seeds from it) — we do
  // NOT re-run on raw `network-changed` nudges, which macOS' route monitor
  // emits for transient routing churn and which turned into a probe storm.
  const run = useCallback(async () => {
    await Promise.all([reloadFull(), reloadLive()])
  }, [reloadFull, reloadLive])

  return {
    diagnostics: overlayLiveMetrics(full.data, live.data),
    isRunning: full.isBusy,
    error: full.error ?? live.error,
    run,
  }
}
