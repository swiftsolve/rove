import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'

import { queryClient } from '@/app/utils/query-client'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { ServiceEvent } from '@/types'

const SERVICE_HISTORY_KEY = ['services', 'history']

type UseServiceHistoryResult = {
  /** The timeline, newest first. Empty until the first read lands. */
  events: ServiceEvent[]
  /** The first read has landed, so an empty `events` really means none. */
  isLoaded: boolean
  /** Wipe the stored timeline, and the cached copy with it. */
  clear: () => Promise<void>
}

/**
 * The services outage timeline, owned by the backend store and recorded by the
 * always-on services heartbeat — so it holds outages that happened while this
 * page, or the whole window, was closed. It re-reads each time the timeline
 * opens, showing the cached copy meanwhile.
 *
 * Re-reads whenever the heartbeat says it folded in a fresh probe, so an outage
 * that starts while the timeline is on screen appears without a manual refresh.
 */
export function useServiceHistory(): UseServiceHistoryResult {
  const api = window.networkAPI
  const { data } = useBackendQuery({
    queryKey: SERVICE_HISTORY_KEY,
    queryFn: api ? () => api.getServiceHistory() : undefined,
    isEnabled: true,
    errorMessage: 'Failed to load the services timeline',
  })

  useEffect(
    () => api?.onServicesTimeline(() => void queryClient.invalidateQueries({ queryKey: SERVICE_HISTORY_KEY })),
    [api],
  )

  const clearMutation = useMutation({
    mutationFn: async () => api?.clearServiceHistory(),
    onSuccess: () => queryClient.setQueryData<ServiceEvent[]>(SERVICE_HISTORY_KEY, []),
  })

  const clear = async (): Promise<void> => {
    await clearMutation.mutateAsync()
  }

  return { events: data ?? [], isLoaded: data !== undefined, clear }
}
