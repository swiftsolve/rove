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
 * The services outage timeline, recorded by the backend's always-on heartbeat, so
 * it holds outages from while the window was closed. Re-reads on open (showing
 * the cached copy meanwhile) and whenever the heartbeat folds in a fresh probe.
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
