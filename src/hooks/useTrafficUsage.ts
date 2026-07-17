import { useMemo } from 'react'
import type { TrafficUsageSummary } from '@/types'
import { createEmptyTrafficUsage } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

const REFRESH_INTERVAL_MS = 5_000

const EMPTY_USAGE = createEmptyTrafficUsage()

interface UseTrafficUsageResult {
  readonly usage: TrafficUsageSummary
  readonly isLoading: boolean
  readonly error: string | null
}

/**
 * Session traffic bucketed by kind (protocol), mirroring `useHostUsage`: a
 * silent background poll keeps the list live while the tab is open, and a
 * missing bridge degrades to a clear message rather than a hung spinner. Reads
 * off the same backend tracker the Hosts view does — no extra sampling.
 */
export function useTrafficUsage(enabled: boolean): UseTrafficUsageResult {
  const api = window.networkAPI
  const fetchUsage = useMemo(
    () => (api?.getTrafficUsage ? () => api.getTrafficUsage() : undefined),
    [api],
  )

  const { data, isBusy, error } = useBackendResource(
    fetchUsage,
    enabled,
    'Failed to load traffic-type usage.',
    { refetchOnEnable: true, pollIntervalMs: REFRESH_INTERVAL_MS },
  )

  if (!fetchUsage) {
    return {
      usage: EMPTY_USAGE,
      isLoading: false,
      error: 'Unable to reach the backend for traffic-type usage.',
    }
  }

  return { usage: data ?? EMPTY_USAGE, isLoading: isBusy, error }
}
