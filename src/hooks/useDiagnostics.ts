import { useEffect } from 'react'
import type { NetworkDiagnostics } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// Diagnostics runs live latency/reachability probes, so poll on the gentler
// cadence rather than the cheap interface read's — fresh, but not a constant
// stream of pings the whole time the tab is open.
const POLL_INTERVAL_MS = 45_000

interface UseDiagnosticsResult {
  readonly diagnostics: NetworkDiagnostics | null
  readonly isRunning: boolean
  readonly error: string | null
  readonly run: () => Promise<void>
}

export function useDiagnostics(enabled: boolean, networkKey?: string | null): UseDiagnosticsResult {
  const { data, isBusy, error, reload } = useBackendResource(
    window.networkAPI?.runDiagnostics,
    enabled,
    'Diagnostics failed',
    { resetKey: networkKey, refetchOnEnable: true, pollIntervalMs: POLL_INTERVAL_MS },
  )

  // The backend nudges us when the routing table changes (network switched) —
  // re-run at once instead of waiting out the poll interval.
  useEffect(() => {
    if (!enabled) return
    const api = window.networkAPI
    if (!api?.onNetworkChanged) return
    let active = true
    const detach = api.onNetworkChanged(() => {
      if (active) void reload()
    })
    return () => {
      active = false
      detach()
    }
  }, [enabled, reload])

  return { diagnostics: data, isRunning: isBusy, error, run: reload }
}
