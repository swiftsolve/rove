import type { CapabilityId, DataUsageSummary, NetworkInfo } from '@/types'
import { getLinkCapacityMbps, isConnectedNetwork } from '@/types'
import { useLiveThroughput } from '@/hooks/useLiveThroughput'
import { useSpeedTest } from '@/hooks/useSpeedTest'
import ConnectionCard, { canRunSpeedTest } from '@/components/connection/ConnectionCard'
import CapabilityStrip from '@/components/capabilities/CapabilityStrip'
import HomeStats from '@/components/home/HomeStats'
import LiveThroughputPanel from '@/components/traffic/LiveThroughputPanel'

interface HomeViewProps {
  readonly info: NetworkInfo
  readonly usage: DataUsageSummary
  readonly usageLoading: boolean
  readonly deviceCount: number | null
  readonly deviceOnline: number | null
  readonly devicesLoading: boolean
  /** macOS only: trigger a device scan from the Home widget (no auto-scan there). */
  readonly onScanDevices?: () => void
  readonly onOpenCapabilities: (capabilityId: CapabilityId) => void
  /** Switch to the Speed tab (where the running test's UI lives). */
  readonly onRunSpeedTest: () => void
  /** Navigate to the Speed page. */
  readonly onOpenSpeed: () => void
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
  onScanDevices,
  onOpenCapabilities,
  onRunSpeedTest,
  onOpenSpeed,
  onOpenUsage,
  onOpenDevices,
}: HomeViewProps): JSX.Element {
  const isConnected = isConnectedNetwork(info)
  // A speed test can be started from the Speed tab and keeps running across tab
  // switches, so the live panel still reflects it while you're on Home.
  const { testing, capabilities, completedAt, runTest } = useSpeedTest()
  const { throughput: liveThroughput, history: liveHistory } = useLiveThroughput()

  const handleRunTest = (): void => {
    onRunSpeedTest() // jump to the Speed tab so the progress is visible
    void runTest()
  }

  return (
    <div className="view-page">
      <ConnectionCard info={info} />

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
          completedAt={completedAt}
          onOpenDetails={onOpenCapabilities}
          onRunTest={handleRunTest}
          onOpenSpeed={onOpenSpeed}
        />
      )}

      <HomeStats
        usage={usage}
        usageLoading={usageLoading}
        deviceCount={deviceCount}
        deviceOnline={deviceOnline}
        devicesLoading={devicesLoading}
        onScanDevices={onScanDevices}
        onOpenUsage={onOpenUsage}
        onOpenDevices={onOpenDevices}
      />
    </div>
  )
}
