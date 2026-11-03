import { type ReactNode, useMemo } from 'react'

import { ConnectionStatusContext } from '@/app/context/connection-status-context'
import { InternetStatusContext } from '@/app/context/internet-status-context'
import { NetworkContext } from '@/app/context/network-context'
import { describeConnectionStatus } from '@/app/utils/connection-status'
import { useInternetStatusSource } from '@/features/connection/hooks/useInternetStatusSource'
import { useNetworkInfoSource } from '@/features/connection/hooks/useNetworkInfoSource'
import { useLiveThroughputSource } from '@/features/live-throughput/hooks/useLiveThroughput'
import { usePageVisible } from '@/hooks/usePageVisible'

/**
 * Owns the app-wide network state: network info, internet status and the
 * connection verdict made from the two. Each has its own context, so a reader
 * re-renders only when its value changes.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  // The local link (Wi-Fi / Ethernet) and, separately, whether the public
  // internet is reachable through it: the link can be up while the WAN is down
  // (an ISP outage, or a bridge interface with no route out).
  const network = useNetworkInfoSource()
  const internet = useInternetStatusSource()

  // Rebuilt only when the verdict changes, not on every network info update.
  const { tone, label, internet: verdict } = describeConnectionStatus(network.info, internet)
  const connection = useMemo(() => ({ tone, label, internet: verdict }), [tone, label, verdict])

  // App-wide, not per-view, so the Home chart's 60 s history is current on return.
  const isWindowVisible = usePageVisible()
  useLiveThroughputSource(isWindowVisible)

  return (
    <NetworkContext value={network}>
      <InternetStatusContext value={internet}>
        <ConnectionStatusContext value={connection}>{children}</ConnectionStatusContext>
      </InternetStatusContext>
    </NetworkContext>
  )
}
