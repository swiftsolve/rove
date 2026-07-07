import { useEffect } from 'react'
import type { NetworkInterfaceSummary } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// Keep interface values (link speed, IP, oper state) live while the tab is open.
const POLL_INTERVAL_MS = 15_000

interface UseNetworkInterfacesResult {
  readonly interfaces: readonly NetworkInterfaceSummary[]
  readonly isLoading: boolean
  readonly error: string | null
  readonly refresh: () => Promise<void>
}

export function useNetworkInterfaces(enabled: boolean): UseNetworkInterfacesResult {
  const { data, isBusy, error, reload } = useBackendResource(
    window.networkAPI?.getInterfaces,
    enabled,
    'Failed to load interfaces',
    { refetchOnEnable: true, pollIntervalMs: POLL_INTERVAL_MS },
  )

  // The backend nudges us when the routing table changes (cable pulled, Wi-Fi
  // joined) — refresh at once instead of waiting out the poll interval.
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

  return { interfaces: data ?? [], isLoading: isBusy, error, refresh: reload }
}
