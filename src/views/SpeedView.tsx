import { useState } from 'react'
import type { NetworkInfo } from '@/types'
import { getLinkCapacityMbps } from '@/types'
import { useSpeedTest } from '@/hooks/useSpeedTest'
import { canRunSpeedTest } from '@/components/connection/ConnectionCard'
import SpeedTestSection from '@/components/speed-test/SpeedTestSection'
import CapabilityList from '@/components/capabilities/CapabilityList'
import CapabilityDetails from '@/components/capabilities/CapabilityDetails'
import SpeedHistory from '@/components/speed-test/SpeedHistory'

interface SpeedViewProps {
  readonly info: NetworkInfo
}

export default function SpeedView({ info }: SpeedViewProps): JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const {
    internetSpeed,
    capabilities,
    testing,
    progress,
    error: speedTestError,
    runTest,
    cancelTest,
  } = useSpeedTest()

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
      <SpeedTestSection
        internetSpeed={internetSpeed}
        linkCapacityMbps={getLinkCapacityMbps(info)}
        connection={
          info.connectionType === 'wifi'
            ? { type: 'wifi', name: info.ssid ?? null }
            : info.connectionType === 'ethernet'
              ? { type: 'ethernet', name: null }
              : null
        }
        testing={testing}
        canTest={canRunSpeedTest(info)}
        error={speedTestError}
        progress={progress}
        onRunTest={runTest}
        onCancelTest={cancelTest}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <CapabilityList
        capabilities={capabilities}
        hasRunTest={hasRunTest}
        onOpenDetails={() => setDetailsOpen(true)}
      />
    </div>
  )
}
