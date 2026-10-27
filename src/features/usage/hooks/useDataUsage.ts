import type { DataUsageSummary } from '@/types'
import { createEmptyDataUsage } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'

const REFRESH_INTERVAL_MS = 10_000

const EMPTY_USAGE = createEmptyDataUsage()

interface UseDataUsageResult {
  usage: DataUsageSummary
  isLoading: boolean
  error: string | null
}

export function useDataUsage(): UseDataUsageResult {
  const api = window.networkAPI
  // "no bridge → no-op" behaviour: an undefined fetcher when the bridge is absent.
  const fetchUsage = api ? () => api.getDataUsage() : undefined

  // Polls are silent background refreshes: a failed one keeps showing the last
  // summary while surfacing that the refresh failed, and polling pauses while
  // the window is hidden (with one fresh read on resume).
  const { data, isBusy, error } = useBackendQuery({
    queryKey: ['dataUsage'],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage: 'Failed to load data usage.',
    pollIntervalMs: REFRESH_INTERVAL_MS,
  })

  // No bridge: report it and skip the spinner rather than hang on "Loading…".
  if (!fetchUsage) {
    return { usage: EMPTY_USAGE, isLoading: false, error: 'Unable to reach the backend for data usage.' }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error }
}
