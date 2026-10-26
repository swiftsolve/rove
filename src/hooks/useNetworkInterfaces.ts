import type { NetworkInterfaceSummary } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'

// Keep interface values (link speed, IP, oper state) live while the tab is open.
const POLL_INTERVAL_MS = 15_000

interface UseNetworkInterfacesResult {
  interfaces: NetworkInterfaceSummary[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useNetworkInterfaces(isEnabled: boolean): UseNetworkInterfacesResult {
  const { data, isBusy, error, reload } = useBackendResource(
    window.networkAPI?.getInterfaces,
    isEnabled,
    'Failed to load interfaces',
    { shouldRefetchOnEnable: true, pollIntervalMs: POLL_INTERVAL_MS },
  )

  // Network changed — refresh at once instead of waiting out the poll interval.
  useOnNetworkChanged(() => void reload(), isEnabled)

  return { interfaces: data ?? [], isLoading: isBusy, error, refresh: reload }
}
