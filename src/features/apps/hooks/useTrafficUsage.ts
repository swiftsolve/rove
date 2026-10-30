import type { TrafficUsageSummary } from '@/types'
import { createEmptyTrafficUsage } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'

const REFRESH_INTERVAL_MS = 5_000

const EMPTY_USAGE = createEmptyTrafficUsage()

interface UseTrafficUsageResult {
  usage: TrafficUsageSummary
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * Session traffic bucketed by kind (protocol), mirroring `useHostUsage`: a
 * silent background poll keeps the list live while the tab is open, and a
 * missing bridge degrades to a clear message rather than a hung spinner. Reads
 * off the same backend tracker the Hosts view does — no extra sampling.
 */
export function useTrafficUsage(): UseTrafficUsageResult {
  const api = window.networkAPI
  const fetchUsage = api ? () => api.getTrafficUsage() : undefined

  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['trafficUsage'],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage: 'Couldn’t load traffic types',
    pollIntervalMs: REFRESH_INTERVAL_MS,
  })

  if (!fetchUsage) {
    return {
      usage: EMPTY_USAGE,
      isLoading: false,
      error: 'Can’t reach the app',
      reload,
    }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error, reload }
}
