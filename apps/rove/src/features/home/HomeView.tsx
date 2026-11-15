import type { JSX } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { CapabilitiesCard } from '@/features/capabilities/CapabilitiesCard'
import { ConnectionCard } from '@/features/current-network/ConnectionCard'
import { DevicesCard } from '@/features/home/components/DevicesCard'
import { UsageCard } from '@/features/home/components/UsageCard'
import { TrafficCard } from '@/features/live-throughput/TrafficCard'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { isConnectedNetwork } from '@/types'

export function HomeView(): JSX.Element | null {
  const { info } = useNetwork()
  // Earlier results keep the capability strip on screen even while offline.
  const hasCapabilities = useSpeedTest((test) => test.capabilities.length > 0)

  // Home can't render without network info; the shell shows its own state until then.
  if (!info) return null

  const isConnected = isConnectedNetwork(info)

  return (
    <div className="page">
      {/* No visible title on Home, but every screen needs an h1: it names the
          page for screen readers and is where focus lands on navigation. */}
      <h1 className="sr-only">Home</h1>
      <ConnectionCard info={info} />

      {isConnected && <TrafficCard />}
      {(isConnected || hasCapabilities) && <CapabilitiesCard />}

      {/* Two different summaries side by side, not a list: each card is its own
          section. Usage carries two numbers, so it gets the wider column. */}
      <div className="grid grid-cols-[3fr_2fr] gap-(--card-gap)">
        <UsageCard />
        <DevicesCard />
      </div>
    </div>
  )
}
