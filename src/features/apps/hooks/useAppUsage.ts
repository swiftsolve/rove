import type { AppUsageSummary } from '@/types'
import { createEmptyAppUsage } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'

const REFRESH_INTERVAL_MS = 5_000

const EMPTY_USAGE = createEmptyAppUsage()

interface UseAppUsageResult {
  usage: AppUsageSummary
  isLoading: boolean
  error: string | null
}

/**
 * Per-app network usage, mirroring `useDataUsage`: a silent background poll
 * keeps the list live while the tab is open, and a missing bridge degrades to a
 * clear message rather than a hung spinner. Polls a little faster than the daily
 * usage summary since the underlying totals climb continuously.
 */
export function useAppUsage(): UseAppUsageResult {
  const api = window.networkAPI
  const fetchUsage = api ? () => api.getAppUsage() : undefined

  const { data, isBusy, error } = useBackendQuery({
    queryKey: ['appUsage'],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage: 'Failed to load per-app usage.',
    pollIntervalMs: REFRESH_INTERVAL_MS,
  })

  if (!fetchUsage) {
    return {
      usage: EMPTY_USAGE,
      isLoading: false,
      error: 'Unable to reach the backend for per-app usage.',
    }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error }
}
