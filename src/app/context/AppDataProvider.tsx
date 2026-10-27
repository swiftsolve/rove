import type { ReactNode } from 'react'
import { useNetworkInfo } from '@/features/connection/hooks/useNetworkInfo'
import { useInternetStatus } from '@/features/connection/hooks/useInternetStatus'
import { useLiveThroughputSource } from '@/features/live-throughput/hooks/useLiveThroughput'
import { usePageVisible } from '@/hooks/usePageVisible'
import { useNavigation } from '@/app/hooks/useNavigation'
import { AppDataContext } from '@/app/context/app-data-context'
import { describeConnectionStatus } from '@/app/utils/connection-status'
import { useScreenData } from '@/app/hooks/useScreenData'

/**
 * Owns the app's backend data — network info, internet status and every
 * screen's cached results — so any component can read it with `useAppData()`.
 * It lives above the screens so the cache survives tab switches.
 */
export function AppDataProvider({ children }: { children: ReactNode }): JSX.Element {
  const { location } = useNavigation()

  // The local link (Wi-Fi / Ethernet) and, separately, whether the public
  // internet is reachable through it: the link can be up while the WAN is down
  // (an ISP outage, or a bridge interface with no route out).
  const network = useNetworkInfo()
  const internet = useInternetStatus()
  const connection = describeConnectionStatus(network.info, internet)

  // Own the live-throughput feed for the whole app, not per-view: keep sampling
  // the 60 s history while the window is visible (across every tab) so the Home
  // chart is already current on return instead of resuming a stale snapshot.
  const isWindowVisible = usePageVisible()
  useLiveThroughputSource(isWindowVisible)

  const screens = useScreenData(location, network.info, internet)

  return (
    <AppDataContext.Provider value={{ network, internet, connection, screens }}>
      {children}
    </AppDataContext.Provider>
  )
}
