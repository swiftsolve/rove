import type { DataUsageSummary, NetworkInfo } from '@/types'
import { getLinkCapacityMbps, isConnectedNetwork } from '@/types'
import { useLiveThroughput } from '@/hooks/useLiveThroughput'
import { useSpeedTest } from '@/hooks/useSpeedTest'
import ConnectionCard, { canRunSpeedTest } from '@/components/connection/ConnectionCard'
import CapabilityStrip from '@/components/capabilities/CapabilityStrip'
import HomeStats from '@/components/home/HomeStats'
import LiveThroughputPanel from '@/components/traffic/LiveThroughputPanel'
import './HomeView.css'

interface HomeViewProps {
  readonly info: NetworkInfo
  readonly usage: DataUsageSummary
  readonly usageLoading: boolean
  readonly deviceCount: number | null
  readonly deviceOnline: number | null
  readonly devicesLoading: boolean
  readonly onOpenCapabilities: () => void
  /** Switch to the Speed tab (where the running test's UI lives). */
  readonly onRunSpeedTest: () => void
  readonly onOpenUsage: () => void
  readonly onOpenDevices: () => void
}

export default function HomeView({
  info,
  usage,
  usageLoading,
  deviceCount,
  deviceOnline,
  devicesLoading,
  onOpenCapabilities,
  onRunSpeedTest,
  onOpenUsage,
  onOpenDevices,
}: HomeViewProps): JSX.Element {
  const isConnected = isConnectedNetwork(info)
  // A speed test can be started from the Speed tab and keeps running across tab
  // switches, so the live panel still reflects it while you're on Home.
  const { testing, capabilities, runTest } = useSpeedTest()
  const { throughput: liveThroughput, history: liveHistory } = useLiveThroughput(isConnected)

  const handleRunTest = (): void => {
    onRunSpeedTest() // jump to the Speed tab so the progress is visible
    void runTest()
  }

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

      {(isConnected || capabilities.length > 0) && (
        <CapabilityStrip
          capabilities={capabilities}
          canRunTest={canRunSpeedTest(info)}
          testing={testing}
          onOpenDetails={onOpenCapabilities}
          onRunTest={handleRunTest}
        />
      )}

      <HomeStats
        usage={usage}
        usageLoading={usageLoading}
        deviceCount={deviceCount}
        deviceOnline={deviceOnline}
        devicesLoading={devicesLoading}
        onOpenUsage={onOpenUsage}
        onOpenDevices={onOpenDevices}
      />
    </div>
  )
}
