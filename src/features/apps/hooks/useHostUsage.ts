import type { HostUsageSummary } from '@/types'
import { createEmptyHostUsage } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'

const REFRESH_INTERVAL_MS = 5_000

const EMPTY_USAGE = createEmptyHostUsage()

interface UseHostUsageResult {
  usage: HostUsageSummary
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * Per-app remote-host breakdown, mirroring `useAppUsage`: a silent background
 * poll keeps the list live while the tab is open (hostnames and country flags
 * fill in over the first few polls as the backend resolves them), and a missing
 * bridge degrades to a clear message rather than a hung spinner.
 */
export function useHostUsage(): UseHostUsageResult {
  const api = window.networkAPI
  const fetchUsage = api ? () => api.getHostUsage() : undefined

  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['hostUsage'],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage: 'Couldn’t load hosts',
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
