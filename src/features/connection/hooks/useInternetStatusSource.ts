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
    void api.getInternetStatus().then((nextStatus) => {
      if (isActive) setStatus(nextStatus)
    })
    const detach = api.onInternetStatus((nextStatus) => {
      if (isActive) setStatus(nextStatus)
    })
    return () => {
      isActive = false
      detach()
    }
  }, [])

  return status
}
