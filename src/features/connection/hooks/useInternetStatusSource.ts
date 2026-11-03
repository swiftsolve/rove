import { useEffect, useState } from 'react'

import type { InternetStatus } from '@/types'

/**
 * Public-internet reachability, kept live off the backend's heartbeat. Separate
 * from the local link: the internet can be down while Wi-Fi or Ethernet is up.
 *
 * Null until the first verdict (or without a bridge); callers then defer to the
 * local link. Called once, by `NetworkProvider`; read it with `useInternetStatus()`.
 */
export function useInternetStatusSource(): InternetStatus | null {
  const [status, setStatus] = useState<InternetStatus | null>(null)

  useEffect(() => {
    const api = window.networkAPI
    if (!api) return
    // Drops a read or event that lands after teardown (e.g. an HMR remount).
    let isActive = true
    // An event is newer than the opening read, so once one lands the read is stale.
    let hasEvent = false
    const detach = api.onInternetStatus((nextStatus) => {
      hasEvent = true
      if (isActive) setStatus(nextStatus)
    })
    api.getInternetStatus().then(
      (nextStatus) => {
        if (isActive && !hasEvent) setStatus(nextStatus)
      },
      // No verdict yet: callers defer to the local link, and the next heartbeat brings one.
      () => undefined,
    )
    return () => {
      isActive = false
      detach()
    }
  }, [])

  return status
}
