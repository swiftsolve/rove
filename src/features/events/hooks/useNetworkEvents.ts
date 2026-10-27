import { useEffect, useMemo, useRef } from 'react'
import type { NetworkEvent } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

// A cheap local DB read, so the feed can afford a quick background poll.
const EVENTS_POLL_INTERVAL_MS = 5000

interface UseNetworkEventsResult {
  events: NetworkEvent[]
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * The network-change feed. Unlike a device scan this is a cheap local DB read,
 * so it both refetches when the Events tab opens and polls quietly in the
 * background — new events accrue whenever a scan runs (here or on another tab),
 * and the poll surfaces them without the user hitting refresh.
 *
 * `isDeviceScanRunning` lets the feed catch up the moment a scan finishes.
 */
export function useNetworkEvents(isEnabled: boolean, isDeviceScanRunning: boolean): UseNetworkEventsResult {
  const api = window.networkAPI
  const fetchEvents = useMemo(
    () => (api?.getNetworkEvents ? () => api.getNetworkEvents() : undefined),
    [api],
  )

  const { data, isBusy, error, reload } = useBackendResource(
    fetchEvents,
    isEnabled,
    'Failed to load network events',
    { shouldRefetchOnEnable: true, pollIntervalMs: EVENTS_POLL_INTERVAL_MS },
  )

  // A scan is what generates new events, so pull the feed the moment one
  // finishes (running true→false) rather than waiting on the poll.
  const wasScanningRef = useRef(false)
  useEffect(() => {
    if (wasScanningRef.current && !isDeviceScanRunning) void reload()
    wasScanningRef.current = isDeviceScanRunning
  }, [isDeviceScanRunning, reload])

  return { events: data ?? [], isLoading: isBusy, error, reload }
}
