import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { queryClient } from '@/app/utils/query-client'
import { getNetworkApi } from '@/bridge/network-api'
import type { InternetStatus } from '@/types'

const INTERNET_STATUS_KEY = ['network', 'internet-status']

/** The backend's verdict, or the cached one when a heartbeat beat it or the read failed. */
async function readInternetStatus(): Promise<InternetStatus | null> {
  const startedAt = Date.now()
  const cachedStatus = (): InternetStatus | null =>
    queryClient.getQueryData<InternetStatus | null>(INTERNET_STATUS_KEY) ?? null
  try {
    const status = await getNetworkApi().getInternetStatus()
    // A heartbeat that landed while this read was in flight is newer than it.
    const updatedAt = queryClient.getQueryState(INTERNET_STATUS_KEY)?.dataUpdatedAt ?? 0
    return updatedAt >= startedAt ? cachedStatus() : status
  } catch {
    // No verdict yet: callers defer to the local link, and the next heartbeat brings one.
    return cachedStatus()
  }
}

/**
 * Public-internet reachability, kept live off the backend's heartbeat. Separate
 * from the local link: the internet can be down while Wi-Fi or Ethernet is up.
 *
 * Null until the first verdict (or without a backend); callers then defer to the
 * local link. Called once, by `NetworkProvider`; read it with `useInternetStatus()`.
 */
export function useInternetStatusSource(): InternetStatus | null {
  // Missing in a plain web build, or a test that installs no fake.
  const hasBackend = window.networkAPI !== undefined
  const { data } = useQuery({
    queryKey: INTERNET_STATUS_KEY,
    queryFn: readInternetStatus,
    enabled: hasBackend,
    // Read once; from then on the heartbeat keeps it current.
    staleTime: Infinity,
  })

  useEffect(() => {
    const api = window.networkAPI
    if (!api) return
    // The bridge's unsubscribe is async, so an event can still arrive after cleanup.
    let isActive = true
    const detach = api.onInternetStatus((status) => {
      if (isActive) queryClient.setQueryData(INTERNET_STATUS_KEY, status)
    })
    return () => {
      isActive = false
      detach()
    }
  }, [])

  return data ?? null
}
