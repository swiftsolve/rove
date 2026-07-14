import { useCallback } from 'react'
import type { NetworkDiagnostics } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// The live metrics (gateway latency + service reachability) refresh on this
// tight cadence so the Connection view's numbers stay current. The heavier full
// run — ISP geolocation and SNMP router identity — is NOT polled; it only runs
// on tab open and network change, so an external lookup isn't hit every poll.
const LIVE_POLL_INTERVAL_MS = 15_000

interface UseDiagnosticsResult {
  readonly diagnostics: NetworkDiagnostics | null
  readonly isRunning: boolean
  readonly error: string | null
  readonly run: () => Promise<void>
}

export function useDiagnostics(enabled: boolean, networkKey?: string | null): UseDiagnosticsResult {
  // Full snapshot: identity (gateway, DNS, vendor, model) + ISP. Fetched on
  // enable and whenever the network switches — never on the poll interval.
  const full = useBackendResource(
    window.networkAPI?.runDiagnostics,
    enabled,
    'Diagnostics failed',
    { resetKey: networkKey, refetchOnEnable: true },
  )

  // Live metrics, refreshed every 15s. Poll-only: the full run above already
  // probes the gateway and services for the initial paint, so live must NOT
  // fetch on open too — that was probing every target twice on each visit. It
  // just keeps those numbers current on the interval (paused while hidden, one
  // fresh read on resume) and takes over once its first reading lands.
  const live = useBackendResource(
    window.networkAPI?.runDiagnosticsLive,
    enabled,
    'Diagnostics failed',
    {
      resetKey: networkKey,
      pollIntervalMs: LIVE_POLL_INTERVAL_MS,
      fetchOnEnable: false,
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

  // Overlay the live metrics on the last full snapshot. Once a live reading has
  // landed it owns latency/services wholesale (a null ping means "unreachable",
  // which must win over the full run's stale value); until then the full run's
  // own initial reading shows, so nothing flashes empty on open.
  const diagnostics =
    full.data == null
      ? null
      : live.data == null
        ? full.data
        : {
            ...full.data,
            gatewayPing: live.data.gatewayPing,
            internet: live.data.internet,
            services: live.data.services,
          }

  return {
    diagnostics,
    isRunning: full.isBusy,
    error: full.error ?? live.error,
    run,
  }
}
