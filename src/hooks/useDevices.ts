import { useMemo } from 'react'
import type { LanDeviceScan } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

interface UseDevicesResult {
  readonly scan: LanDeviceScan | null
  readonly isScanning: boolean
  readonly error: string | null
  readonly rescan: () => Promise<void>
}

export function useDevices(enabled: boolean, networkKey?: string | null): UseDevicesResult {
  const api = window.networkAPI
  // "no bridge → no-op" behaviour: an undefined fetcher when the bridge is absent.
  const fetchDevices = useMemo(
    () => (api?.getDevices ? () => api.getDevices() : undefined),
    [api],
  )

  // No periodic poll: a LAN scan is heavy (ARP/SSDP/ping sweeps) and repeatedly
  // rescanning in the background is intrusive. Scan when the tab opens, when the
  // network changes, or when the user hits refresh — nothing on a timer.
  // A genuine network switch is already covered by `resetKey: networkKey` — when
  // the interface or IP changes, the cache invalidates and rescans. We do NOT
  // rescan on every raw `network-changed` nudge: macOS' route-socket monitor
  // emits those for transient routing churn (including traffic from our own
  // scan), which turned into an endless self-triggering rescan loop.
  const { data, isBusy, error, reload } = useBackendResource(
    fetchDevices,
    enabled,
    'Failed to scan for devices',
    { resetKey: networkKey, refetchOnEnable: true },
  )

  return { scan: data, isScanning: isBusy, error, rescan: reload }
}
