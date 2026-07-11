import { useMemo } from 'react'
import type { DataUsageSummary } from '@/types'
import { createEmptyDataUsage } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

const REFRESH_INTERVAL_MS = 10_000

const EMPTY_USAGE = createEmptyDataUsage()

interface UseDataUsageResult {
  readonly usage: DataUsageSummary
  readonly isLoading: boolean
  readonly error: string | null
}

export function useDataUsage(enabled: boolean): UseDataUsageResult {
  const api = window.networkAPI
  // "no bridge → no-op" behaviour: an undefined fetcher when the bridge is absent.
  const fetchUsage = useMemo(
    () => (api?.getDataUsage ? () => api.getDataUsage() : undefined),
    [api],
  )

  // Polls are silent background refreshes: a failed one keeps showing the last
  // summary while surfacing that the refresh failed, and polling pauses while
  // the window is hidden (with one fresh read on resume).
  const { data, isBusy, error } = useBackendResource(
    fetchUsage,
    enabled,
    'Failed to load data usage.',
    { refetchOnEnable: true, pollIntervalMs: REFRESH_INTERVAL_MS },
  )

  // No bridge: report it and skip the spinner rather than hang on "Loading…".
  if (!fetchUsage) {
    return { usage: EMPTY_USAGE, isLoading: false, error: 'Unable to reach the backend for data usage.' }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error }
}
