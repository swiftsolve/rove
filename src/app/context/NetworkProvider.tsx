import { useMemo, type ReactNode } from 'react'
import { useNetworkInfoSource } from '@/features/connection/hooks/useNetworkInfoSource'
import { useInternetStatusSource } from '@/features/connection/hooks/useInternetStatusSource'
import { useLiveThroughputSource } from '@/features/live-throughput/hooks/useLiveThroughput'
import { usePageVisible } from '@/hooks/usePageVisible'
import { NetworkContext } from '@/app/context/network-context'
import { InternetStatusContext } from '@/app/context/internet-status-context'
import { ConnectionStatusContext } from '@/app/context/connection-status-context'
import { describeConnectionStatus } from '@/app/utils/connection-status'

/**
 * Owns the app-wide network state: network info, internet status and the
 * connection verdict made from the two. Each has its own context, so a reader
 * re-renders only when its value changes.
 */
export function NetworkProvider({ children }: { children: ReactNode }): JSX.Element {
  // The local link (Wi-Fi / Ethernet) and, separately, whether the public
  // internet is reachable through it: the link can be up while the WAN is down
  // (an ISP outage, or a bridge interface with no route out).
  const network = useNetworkInfoSource()
  const internet = useInternetStatusSource()

  // Rebuilt only when the verdict changes, not on every network info update.
  const { tone, label, internet: verdict } = describeConnectionStatus(network.info, internet)
  const connection = useMemo(() => ({ tone, label, internet: verdict }), [tone, label, verdict])

  // Own the live-throughput feed for the whole app, not per-view: keep sampling
  // the 60 s history while the window is visible (across every tab) so the Home
  // chart is already current on return instead of resuming a stale snapshot.
  const isWindowVisible = usePageVisible()
  useLiveThroughputSource(isWindowVisible)

  return (
    <NetworkContext.Provider value={network}>
      <InternetStatusContext.Provider value={internet}>
        <ConnectionStatusContext.Provider value={connection}>{children}</ConnectionStatusContext.Provider>
      </InternetStatusContext.Provider>
    </NetworkContext.Provider>
  )
}
