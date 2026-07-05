import type { NetworkInfo } from '@/types'
import { getLinkCapacityMbps, isConnectedNetwork } from '@/types'
import { useLiveThroughput } from '@/hooks/useLiveThroughput'
import { useSpeedTest } from '@/hooks/useSpeedTest'
import ConnectionCard from '@/components/connection/ConnectionCard'
import CapabilityStrip from '@/components/capabilities/CapabilityStrip'
import LiveThroughputPanel from '@/components/traffic/LiveThroughputPanel'
import './HomeView.css'

interface HomeViewProps {
  readonly info: NetworkInfo
  readonly onOpenCapabilities: () => void
}

export default function HomeView({ info, onOpenCapabilities }: HomeViewProps): JSX.Element {
  const isConnected = isConnectedNetwork(info)
  // A speed test can be started from the Speed tab and keeps running across tab
  // switches, so the live panel still reflects it while you're on Home.
  const { testing, capabilities, internetSpeed } = useSpeedTest()
  const { throughput: liveThroughput, history: liveHistory } = useLiveThroughput(isConnected)
  const hasRunTest = internetSpeed != null

  return (
    <div className="view-page">
      <ConnectionCard info={info} />

      {!isConnected && (
        <div className="offline-notice surface">
          <p className="text-hint">
            You&apos;re offline. Connect to Wi‑Fi or plug in Ethernet to see live traffic and
            run a speed test.
          </p>
        </div>
      )}

      {isConnected && (
        <LiveThroughputPanel
          throughput={liveThroughput}
          history={liveHistory}
          speedTestRunning={testing}
          linkCapacityMbps={getLinkCapacityMbps(info)}
        />
      )}

      {hasRunTest && (
        <CapabilityStrip capabilities={capabilities} onOpenDetails={onOpenCapabilities} />
      )}
    </div>
  )
}
