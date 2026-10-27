import { isConnectedNetwork } from '@/types'
import { useAppData } from '@/app/hooks/useAppData'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { ConnectionCard } from '@/features/connection/ConnectionCard'
import { CapabilityStrip } from '@/features/capabilities/CapabilityStrip'
import { UsageCard } from '@/features/home/components/UsageCard'
import { DevicesCard } from '@/features/home/components/DevicesCard'
import { LiveThroughputPanel } from '@/features/live-throughput/LiveThroughputPanel'
import styles from './HomeView.module.css'

export function HomeView(): JSX.Element | null {
  const { info } = useAppData().network
  // Earlier results keep the capability strip on screen even while offline.
  const { capabilities } = useSpeedTest()

  // Home can't render without network info; the shell shows its own state until then.
  if (!info) return null

  const isConnected = isConnectedNetwork(info)

  return (
    <div className="view-page">
      {/* No visible title on Home, but every screen needs an h1: it names the
          page for screen readers and is where focus lands on navigation. */}
      <h1 className="sr-only">Home</h1>
      <ConnectionCard info={info} />

      {isConnected && <LiveThroughputPanel />}
      {(isConnected || capabilities.length > 0) && <CapabilityStrip />}

      <ul role="list" className={styles.statCards}>
        <li className={styles.statCard}>
          <UsageCard />
        </li>
        <li className={styles.statCard}>
          <DevicesCard />
        </li>
      </ul>
    </div>
  )
}
