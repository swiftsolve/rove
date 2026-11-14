import { useBackendQuery } from '@/hooks/useBackendQuery'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'
import type { NetworkInterfaceSummary } from '@/types'

/** Keep interface values (link speed, IP, oper state) live while the tab is open. */
const POLL_INTERVAL_MS = 15_000

type UseNetworkInterfacesResult = {
  interfaces: NetworkInterfaceSummary[]
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useNetworkInterfaces(): UseNetworkInterfacesResult {
  const api = window.networkAPI
  const { data, isBusy, error, reload, refresh } = useBackendQuery({
    queryKey: ['interfaces'],
    queryFn: api ? () => api.getInterfaces() : undefined,
    isEnabled: true,
    errorMessage: 'Couldn’t load interfaces',
    pollIntervalMs: POLL_INTERVAL_MS,
  })

  // Quietly: macOS sends bursts of these while Wi-Fi roams, and a manual reload
  // would spin the Refresh button and cancel the read in flight on each one.
  useOnNetworkChanged(() => void refresh())

  return { interfaces: data ?? [], isLoading: isBusy, error, reload }
}
