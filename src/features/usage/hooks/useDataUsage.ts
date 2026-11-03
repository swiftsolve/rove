import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { DataUsageSummary } from '@/types'
import { createEmptyDataUsage } from '@/types'

const REFRESH_INTERVAL_MS = 10_000

const EMPTY_USAGE = createEmptyDataUsage()

type UseDataUsageResult = {
  usage: DataUsageSummary
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useDataUsage(): UseDataUsageResult {
  const api = window.networkAPI
  const fetchUsage = api ? () => api.getDataUsage() : undefined

  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['dataUsage'],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage: 'Couldn’t load data usage',
    pollIntervalMs: REFRESH_INTERVAL_MS,
  })

  // No bridge: report it and skip the spinner rather than hang on "Loading…".
  if (!fetchUsage) {
    return { usage: EMPTY_USAGE, isLoading: false, error: 'Can’t reach the app', reload }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error, reload }
}
