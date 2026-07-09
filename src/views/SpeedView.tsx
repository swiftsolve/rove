import { useEffect, useRef, useState } from 'react'
import type { CapabilityId, NetworkInfo } from '@/types'
import { getLinkCapacityMbps, isWifiNetwork } from '@/types'
import type { SpeedSub } from '@/navigation/useNavigation'
import { useSpeedTest } from '@/hooks/useSpeedTest'
import { useLiveThroughput } from '@/hooks/useLiveThroughput'
import { canRunSpeedTest } from '@/components/connection/ConnectionCard'
import SpeedTestSection, {
  type SpeedTestConnection,
} from '@/components/speed-test/SpeedTestSection'
import CapabilityList from '@/components/capabilities/CapabilityList'
import CapabilityDetails from '@/components/capabilities/CapabilityDetails'
import SpeedHistory from '@/components/speed-test/SpeedHistory'
import { Tooltip } from '@/components/ui/Tooltip'
import { DotSeparator } from '@/components/ui/DotSeparator'
import { HistoryIcon, PlayIcon, SpeedIcon, StopIcon } from '@/components/ui/Icons'
import { formatBand, formatTimeAgo } from '@/lib/format'
import './SpeedView.css'

interface SpeedViewProps {
  readonly info: NetworkInfo
  /** The subpage currently layered over the Speed tab, or null for its main
   *  page. Owned by the app's navigation stack so Back pops the right screen. */
  readonly sub: SpeedSub | null
  /** Open the capability details subpage, scrolled to this capability. */
  readonly onOpenDetails: (target: CapabilityId | null) => void
  /** Open the speed-test history subpage. */
  readonly onOpenHistory: () => void
  /** Return to the previous screen. */
  readonly onBack: () => void
}

function connectionFromNetworkInfo(info: NetworkInfo): SpeedTestConnection | null {
  if (isWifiNetwork(info)) {
    return { type: 'wifi', name: info.ssid ?? null, band: formatBand(info.frequency) }
  }
  if (info.connectionType === 'ethernet') {
    return { type: 'ethernet', name: null, band: null }
  }
  return null
}

export default function SpeedView({
  info,
  sub,
  onOpenDetails,
  onOpenHistory,
  onBack,
}: SpeedViewProps): JSX.Element {
  const {
    internetSpeed,
    capabilities,
    testing,
    progress,
    error: speedTestError,
    completedAt,
    linkCapacityMbps: testLinkCapacityMbps,
    runConnection,
    runTest,
    cancelTest,
  } = useSpeedTest()

  const hasRunTest = internetSpeed != null
  const canTest = canRunSpeedTest(info)
  const liveConnection = connectionFromNetworkInfo(info)

  const footerConnection =
    hasRunTest && runConnection != null ? runConnection : liveConnection
  const footerLinkCapacityMbps =
    hasRunTest && testLinkCapacityMbps != null
      ? testLinkCapacityMbps
      : getLinkCapacityMbps(info)

  // While a test runs, the connection is saturated by the test itself, so the
  // live throughput is a real reading of the current speed. Track its running
  // peak per direction so the on-screen numbers only ever climb, then reset at
  // the start of each test.
  const live = useLiveThroughput()
  const [peaks, setPeaks] = useState({ down: 0, up: 0 })
  const wasTesting = useRef(false)

  useEffect(() => {
    if (testing && !wasTesting.current) setPeaks({ down: 0, up: 0 })
    wasTesting.current = testing
  }, [testing])

  useEffect(() => {
    if (!testing) return
    const { downloadMbps, uploadMbps } = live.throughput
    setPeaks((prev) =>
      downloadMbps > prev.down || uploadMbps > prev.up
        ? { down: Math.max(prev.down, downloadMbps), up: Math.max(prev.up, uploadMbps) }
        : prev,
    )
  }, [testing, live.throughput])

  if (sub?.view === 'history') {
    return <SpeedHistory onBack={onBack} />
  }

  if (sub?.view === 'details' && internetSpeed) {
    return (
      <CapabilityDetails
        capabilities={capabilities}
        speed={internetSpeed}
        completedAt={completedAt}
        targetId={sub.target}
        onBack={onBack}
      />
    )
  }

  const historyLink = (
    <button
      type="button"
      className="speed-history-link"
      onClick={onOpenHistory}
    >
      <HistoryIcon size={13} />
      <span className="speed-history-link-text">View history</span>
    </button>
  )

  return (
    <div className="view-page">
      <div className="view-header speed-header">
        <span className="view-header-icon">
          <SpeedIcon size={18} />
        </span>
        <div className="speed-header-text">
          <span className="view-header-title">Speed</span>
          <span className={`speed-header-sub${completedAt != null ? ' show' : ''}`}>
            {testing ? (
              <>
                <span className="speed-header-status">Testing…</span>
                {completedAt != null && (
                  <>
                    <DotSeparator />
                    {historyLink}
                  </>
                )}
              </>
            ) : completedAt != null ? (
              <>
                Updated {formatTimeAgo(completedAt)}
                <DotSeparator />
                {historyLink}
              </>
            ) : (
              'Measure your download and upload speeds'
            )}
          </span>
        </div>
        <div className="speed-header-actions">
          {testing ? (
            <button
              type="button"
              className="btn-primary speed-run-btn is-stop"
              onClick={cancelTest}
              aria-label="Stop test"
            >
              <StopIcon size={12} />
              Stop
            </button>
          ) : canTest ? (
            <button
              type="button"
              className="btn-primary speed-run-btn"
              onClick={() => void runTest()}
              aria-label={hasRunTest ? 'Test again' : 'Run test'}
            >
              <PlayIcon size={13} />
              {hasRunTest ? 'Test again' : 'Run test'}
            </button>
          ) : (
            <Tooltip content="Connect to a network first">
              <button
                type="button"
                className="btn-primary speed-run-btn"
                disabled
                aria-label="Run test"
              >
                <PlayIcon size={13} />
                Run test
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <SpeedTestSection
        internetSpeed={internetSpeed}
        linkCapacityMbps={footerLinkCapacityMbps}
        connection={footerConnection}
        testing={testing}
        canTest={canTest}
        error={speedTestError}
        progress={progress}
        liveDownloadMbps={peaks.down}
        liveUploadMbps={peaks.up}
      />

      <CapabilityList
        capabilities={capabilities}
        hasRunTest={hasRunTest}
        testing={testing}
        onOpenDetails={onOpenDetails}
      />
    </div>
  )
}
