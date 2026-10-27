import { isConnectedNetwork } from '@/types'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { ConnectionCard } from '@/features/connection/ConnectionCard'
import { CapabilityStrip } from '@/features/capabilities/CapabilityStrip'
import { UsageCard } from '@/features/home/components/UsageCard'
import { DevicesCard } from '@/features/home/components/DevicesCard'
import { LiveThroughputPanel } from '@/features/live-throughput/LiveThroughputPanel'

export function HomeView(): JSX.Element | null {
  const { info } = useNetwork()
  // Earlier results keep the capability strip on screen even while offline.
  const { capabilities } = useSpeedTest()

  // Home can't render without network info; the shell shows its own state until then.
  if (!info) return null

  const isConnected = isConnectedNetwork(info)

  return (
    <div className="page">
      {/* No visible title on Home, but every screen needs an h1: it names the
          page for screen readers and is where focus lands on navigation. */}
      <h1 className="sr-only">Home</h1>
      <ConnectionCard info={info} />

      {isConnected && <LiveThroughputPanel />}
      {(isConnected || capabilities.length > 0) && <CapabilityStrip />}

      {/* Two different summaries side by side, not a list: each card is its own
          section. Usage carries two numbers, so it gets the wider column. */}
      <div className="grid grid-cols-[3fr_2fr] gap-10">
        <UsageCard />
        <DevicesCard />
      </div>
    </div>
  )
}
