import type { NetworkInterfaceSummary } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

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
    { refetchOnEnable: true },
  )
  return { interfaces: data ?? [], isLoading: isBusy, error, refresh: reload }
}
