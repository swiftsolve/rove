import type { NetworkEvent } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import { queryClient } from '@/app/utils/query-client'

// A cheap local DB read, so the feed can afford a quick background poll.
const EVENTS_POLL_INTERVAL_MS = 5000

const NETWORK_EVENTS_KEY = ['networkEvents']

interface UseNetworkEventsResult {
  events: NetworkEvent[]
  isLoading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * Refreshes the feed now, whether or not Events is open, so it's current the
 * moment a device scan finishes (see `useDevices`).
 */
export function refreshNetworkEvents(): void {
  const api = window.networkAPI
  if (!api) return
  void queryClient.prefetchQuery({ queryKey: NETWORK_EVENTS_KEY, queryFn: () => api.getNetworkEvents() })
}

/**
 * The network-change feed. Unlike a device scan this is a cheap local DB read,
 * so it both refetches when the Events tab opens and polls quietly in the
 * background — new events accrue whenever a scan runs (here or on another tab),
 * and the poll surfaces them without the user hitting refresh.
 */
export function useNetworkEvents(): UseNetworkEventsResult {
  const api = window.networkAPI
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: NETWORK_EVENTS_KEY,
    queryFn: api ? () => api.getNetworkEvents() : undefined,
    isEnabled: true,
    errorMessage: 'Couldn’t load network events',
    pollIntervalMs: EVENTS_POLL_INTERVAL_MS,
  })

  return { events: data ?? [], isLoading: isBusy, error, reload }
}
