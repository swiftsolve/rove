import type { LanDeviceScan } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

interface UseDevicesResult {
  readonly scan: LanDeviceScan | null
  readonly isScanning: boolean
  readonly error: string | null
  readonly rescan: () => Promise<void>
}

export function useDevices(enabled: boolean): UseDevicesResult {
  const { data, isBusy, error, reload } = useBackendResource(
    window.networkAPI?.getDevices,
    enabled,
    'Failed to scan for devices',
  )
  return { scan: data, isScanning: isBusy, error, rescan: reload }
}
