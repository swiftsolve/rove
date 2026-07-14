import { useMemo } from 'react'
import type { AppUsageSummary } from '@/types'
import { createEmptyAppUsage } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

const REFRESH_INTERVAL_MS = 5_000

const EMPTY_USAGE = createEmptyAppUsage()

interface UseAppUsageResult {
  readonly usage: AppUsageSummary
  readonly isLoading: boolean
  readonly error: string | null
}

/**
 * Per-app network usage, mirroring `useDataUsage`: a silent background poll
 * keeps the list live while the tab is open, and a missing bridge degrades to a
 * clear message rather than a hung spinner. Polls a little faster than the daily
 * usage summary since the underlying totals climb continuously.
 */
export function useAppUsage(enabled: boolean): UseAppUsageResult {
  const api = window.networkAPI
  const fetchUsage = useMemo(
    () => (api?.getAppUsage ? () => api.getAppUsage() : undefined),
    [api],
  )

  const { data, isBusy, error } = useBackendResource(
    fetchUsage,
    enabled,
    'Failed to load per-app usage.',
    { refetchOnEnable: true, pollIntervalMs: REFRESH_INTERVAL_MS },
  )

  if (!fetchUsage) {
    return {
      usage: EMPTY_USAGE,
      isLoading: false,
      error: 'Unable to reach the backend for per-app usage.',
    }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error }
}
