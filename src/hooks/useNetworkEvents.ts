import { useMemo } from 'react'
import type { NetworkEvent } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

interface UseNetworkEventsResult {
  readonly events: readonly NetworkEvent[]
  readonly isLoading: boolean
  readonly error: string | null
  readonly reload: () => Promise<void>
}

/**
 * The network-change feed. Unlike a device scan this is a cheap local DB read,
 * so it both refetches when the Events tab opens and polls quietly in the
 * background — new events accrue whenever a scan runs (here or on another tab),
 * and the poll surfaces them without the user hitting refresh.
 */
export function useNetworkEvents(enabled: boolean): UseNetworkEventsResult {
  const api = window.networkAPI
  const fetchEvents = useMemo(
    () => (api?.getNetworkEvents ? () => api.getNetworkEvents() : undefined),
    [api],
  )

  const { data, isBusy, error, reload } = useBackendResource(
    fetchEvents,
    enabled,
    'Failed to load network events',
    { refetchOnEnable: true, pollIntervalMs: 5000 },
  )

  return { events: data ?? [], isLoading: isBusy, error, reload }
}
