import { useEffect, useRef, useState } from 'react'
import type { NetworkInfo } from '@/types'
import { getLinkCapacityMbps, isWifiNetwork } from '@/types'
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
  readonly openDetailsInitially?: boolean
  readonly onDetailsOpened?: () => void
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
  openDetailsInitially = false,
  onDetailsOpened,
}: SpeedViewProps): JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
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

  useEffect(() => {
    if (!openDetailsInitially || !hasRunTest) return
    setDetailsOpen(true)
    onDetailsOpened?.()
  }, [openDetailsInitially, hasRunTest, onDetailsOpened])
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
  const live = useLiveThroughput(testing)
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

  if (historyOpen) {
    return <SpeedHistory onBack={() => setHistoryOpen(false)} />
  }

  if (detailsOpen && internetSpeed) {
    return (
      <CapabilityDetails
        capabilities={capabilities}
        speed={internetSpeed}
        completedAt={completedAt}
        onBack={() => setDetailsOpen(false)}
      />
    )
  }

  return (
    <div className="view-page">
      <div className="view-header speed-header">
        <span className="view-header-icon">
          <SpeedIcon size={18} />
        </span>
        <div className="speed-header-text">
          <span className="view-header-title">Speed</span>
          <span className={`speed-header-sub${completedAt != null && !testing ? ' show' : ''}`}>
            {testing ? (
              <span className="speed-header-status">Testing…</span>
            ) : completedAt != null ? (
              <>
                Updated {formatTimeAgo(completedAt)}
                <DotSeparator />
                <button
                  type="button"
                  className="speed-history-link"
                  onClick={() => setHistoryOpen(true)}
                >
                  <HistoryIcon size={13} />
                  <span className="speed-history-link-text">View history</span>
                </button>
              </>
            ) : (
              'Measure your download and upload speeds'
            )}
          </span>
        </div>
        <div className="speed-header-actions">
          {testing ? (
            <Tooltip content="Stop test">
              <button
                type="button"
                className="btn-primary speed-run-btn is-stop"
                onClick={cancelTest}
                aria-label="Stop test"
              >
                <StopIcon size={12} />
                Stop
              </button>
            </Tooltip>
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
        canRunTest={canRunSpeedTest(info)}
        onOpenDetails={() => setDetailsOpen(true)}
        onRunTest={() => void runTest()}
      />
    </div>
  )
}
