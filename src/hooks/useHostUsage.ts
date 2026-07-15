import { useMemo } from 'react'
import type { HostUsageSummary } from '@/types'
import { createEmptyHostUsage } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

const REFRESH_INTERVAL_MS = 5_000

const EMPTY_USAGE = createEmptyHostUsage()

interface UseHostUsageResult {
  readonly usage: HostUsageSummary
  readonly isLoading: boolean
  readonly error: string | null
}

/**
 * Per-app remote-host breakdown, mirroring `useAppUsage`: a silent background
 * poll keeps the list live while the tab is open (hostnames and country flags
 * fill in over the first few polls as the backend resolves them), and a missing
 * bridge degrades to a clear message rather than a hung spinner.
 */
export function useHostUsage(enabled: boolean): UseHostUsageResult {
  const api = window.networkAPI
  const fetchUsage = useMemo(
    () => (api?.getHostUsage ? () => api.getHostUsage() : undefined),
    [api],
  )

  const { data, isBusy, error } = useBackendResource(
    fetchUsage,
    enabled,
    'Failed to load per-app host usage.',
    { refetchOnEnable: true, pollIntervalMs: REFRESH_INTERVAL_MS },
  )

  if (!fetchUsage) {
    return {
      usage: EMPTY_USAGE,
      isLoading: false,
      error: 'Unable to reach the backend for per-app host usage.',
    }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error }
}
