import { useEffect, useState } from 'react'

import type { InternetStatus } from '@/types'

/**
 * The current public-internet reachability, kept live off the backend's
 * always-on heartbeat: an initial cached read on mount, then updated in place
 * whenever the heartbeat observes a change (WAN lost or restored). Distinct from
 * the local link state (`useNetworkInfoSource`) — the internet can be unreachable
 * while Wi-Fi/Ethernet is up (an ISP outage, or a link with no route to the WAN
 * such as a Thunderbolt/VM bridge).
 *
 * Null until the first verdict lands (or when no bridge is present). Callers
 * treat null as "unknown — defer to the local link".
 *
 * Called once, by `NetworkProvider`; components read it with `useInternetStatus()`.
 */
export function useInternetStatusSource(): InternetStatus | null {
  const [status, setStatus] = useState<InternetStatus | null>(null)

  useEffect(() => {
    const api = window.networkAPI
    if (!api) return
    // `isActive` guards against a late-resolving read or event landing after the
    // effect has torn down (e.g. Vite HMR remounts).
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
