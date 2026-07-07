import { useEffect } from 'react'
import type { LanDeviceScan } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// A LAN scan is heavy (ARP/SSDP/ping sweeps), so poll less aggressively than the
// cheap interface read — enough to stay reasonably fresh without hammering the
// network the whole time the tab is open.
const POLL_INTERVAL_MS = 45_000

interface UseDevicesResult {
  readonly scan: LanDeviceScan | null
  readonly isScanning: boolean
  readonly error: string | null
  readonly rescan: () => Promise<void>
}

export function useDevices(enabled: boolean, networkKey?: string | null): UseDevicesResult {
  const { data, isBusy, error, reload } = useBackendResource(
    window.networkAPI?.getDevices,
    enabled,
    'Failed to scan for devices',
    { resetKey: networkKey, refetchOnEnable: true, pollIntervalMs: POLL_INTERVAL_MS },
  )

  // The backend nudges us when the routing table changes (network switched) —
  // rescan at once instead of waiting out the poll interval.
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

  return { scan: data, isScanning: isBusy, error, rescan: reload }
}
