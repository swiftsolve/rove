import { useMemo } from 'react'
import type { LanDeviceScan } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'

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
  const api = window.networkAPI
  // "no bridge → no-op" behaviour: an undefined fetcher when the bridge is absent.
  const fetchDevices = useMemo(
    () => (api?.getDevices ? () => api.getDevices() : undefined),
    [api],
  )

  const { data, isBusy, error, reload } = useBackendResource(
    fetchDevices,
    enabled,
    'Failed to scan for devices',
    { resetKey: networkKey, refetchOnEnable: true, pollIntervalMs: POLL_INTERVAL_MS },
  )

  // Network switched — rescan at once instead of waiting out the poll interval.
  useOnNetworkChanged(() => void reload(), enabled)

  return { scan: data, isScanning: isBusy, error, rescan: reload }
}
