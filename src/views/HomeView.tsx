import { useState } from 'react'
import type { NetworkInfo } from '@shared/types'
import { getLinkCapacityMbps, isConnectedNetwork } from '@shared/types'
import { useLiveThroughput } from '../hooks/useLiveThroughput'
import { useSpeedTest } from '../hooks/useSpeedTest'
import ConnectionCard, { canRunSpeedTest } from '../components/ConnectionCard'
import LiveThroughputPanel from '../components/LiveThroughputPanel'
import BenchmarkSection from '../components/BenchmarkSection'
import CapabilitiesGrid from '../components/CapabilitiesGrid'
import CapabilityDetails from '../components/CapabilityDetails'
import SpeedHistory from '../components/SpeedHistory'
import './HomeView.css'

interface HomeViewProps {
  readonly info: NetworkInfo
}

export default function HomeView({ info }: HomeViewProps): JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const isConnected = isConnectedNetwork(info)
  const {
    internetSpeed,
    capabilities,
    testing,
    progress,
    error: speedTestError,
    runTest,
    cancelTest,
  } = useSpeedTest()

  const { throughput: liveThroughput, history: liveHistory } = useLiveThroughput(isConnected)

  const hasRunTest = internetSpeed != null

  if (historyOpen) {
    return <SpeedHistory onBack={() => setHistoryOpen(false)} />
  }

  if (detailsOpen && internetSpeed) {
    return (
      <CapabilityDetails
        capabilities={capabilities}
        speed={internetSpeed}
        onBack={() => setDetailsOpen(false)}
      />
    )
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

      <BenchmarkSection
        internetSpeed={internetSpeed}
        linkCapacityMbps={getLinkCapacityMbps(info)}
        testing={testing}
        canTest={canRunSpeedTest(info)}
        error={speedTestError}
        progress={progress}
        onRunTest={runTest}
        onCancelTest={cancelTest}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <CapabilitiesGrid
        capabilities={capabilities}
        hasRunTest={hasRunTest}
        onOpenDetails={() => setDetailsOpen(true)}
      />
    </div>
  )
}
