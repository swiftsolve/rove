import type { NetworkInterfaceSummary } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'

// Keep interface values (link speed, IP, oper state) live while the tab is open.
const POLL_INTERVAL_MS = 15_000

interface UseNetworkInterfacesResult {
  interfaces: NetworkInterfaceSummary[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useNetworkInterfaces(): UseNetworkInterfacesResult {
  const api = window.networkAPI
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['interfaces'],
    queryFn: api ? () => api.getInterfaces() : undefined,
    isEnabled: true,
    errorMessage: 'Failed to load interfaces',
    pollIntervalMs: POLL_INTERVAL_MS,
  })

  // Network changed — refresh at once instead of waiting out the poll interval.
  useOnNetworkChanged(() => void reload())

  return { interfaces: data ?? [], isLoading: isBusy, error, refresh: reload }
}
