import { useEffect, useState } from 'react'
import { splitSpeedMbps, formatLatencyMs } from '@/lib/format'
import {
  clearSpeedHistory,
  formatHistoryTimestamp,
  getSpeedHistory,
  type SpeedHistoryEntry,
} from '@/components/speed-test/speed-history'
import Subpage from '@/components/ui/Subpage'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { Tooltip } from '@/components/ui/Tooltip'
import DirectionIcon from '@/components/ui/DirectionIcon'
import type { SpeedSeries } from '@/components/traffic/SpeedReadout'
import { EthernetIcon, GlobeIcon, HistoryIcon, TrashIcon, WifiIcon } from '@/components/ui/Icons'
import './SpeedHistory.css'

interface SpeedHistoryProps {
  readonly onBack: () => void
}

function ConnectionBadge({ entry }: { readonly entry: SpeedHistoryEntry }): JSX.Element {
  const { connectionType, networkName } = entry
  const Icon =
    connectionType === 'wifi' ? WifiIcon : connectionType === 'ethernet' ? EthernetIcon : GlobeIcon
  const fallback =
    connectionType === 'wifi' ? 'Wi‑Fi' : connectionType === 'ethernet' ? 'Ethernet' : 'Unknown'

  return (
    <span className={`history-conn conn-${connectionType}`}>
      <Icon size={13} />
      <span className="history-conn-name">{networkName ?? fallback}</span>
    </span>
  )
}

function Metric({
  label,
  value,
  unit,
  series,
}: {
  readonly label: string
  readonly value: string
  readonly unit?: string
  readonly series?: SpeedSeries
}): JSX.Element {
  return (
    <div className="history-metric">
      <span className="history-metric-label">
        {series && <DirectionIcon series={series} size={13} />}
        <span className="field-label">{label}</span>
      </span>
      <span className="history-metric-value num">
        {value}
        {unit && <span className="history-metric-unit"> {unit}</span>}
      </span>
    </div>
  )
}

function HistoryCard({ entry }: { readonly entry: SpeedHistoryEntry }): JSX.Element {
  const download = splitSpeedMbps(entry.downloadMbps)
  const upload = splitSpeedMbps(entry.uploadMbps)
  const validPing = Number.isFinite(entry.latencyMs) && entry.latencyMs < 999

  return (
    <div className="history-card surface">
      <div className="history-card-head">
        <ConnectionBadge entry={entry} />
        <span className="history-card-time">{formatHistoryTimestamp(entry.timestamp)}</span>
      </div>

      <div className="history-card-metrics">
        <Metric label="Download" value={download.value} unit={download.unit} series="down" />
        <Metric label="Upload" value={upload.value} unit={upload.unit} series="up" />
        <Metric
          label="Ping"
          value={validPing ? formatLatencyMs(entry.latencyMs).replace(' ms', '') : '—'}
          unit={validPing ? 'ms' : undefined}
        />
      </div>

      <div className="history-card-sub num">
        <InlineMeta
          items={[
            <>Jitter {validPing ? formatLatencyMs(entry.jitterMs) : '—'}</>,
            <>{entry.packetLoss}% loss</>,
          ]}
        />
      </div>
    </div>
  )
}

export default function SpeedHistory({ onBack }: SpeedHistoryProps): JSX.Element {
  const [entries, setEntries] = useState<readonly SpeedHistoryEntry[]>([])
  // History loads over an async IPC call, so `entries` is empty on the first
  // frame. Track whether that load has resolved so we don't flash the tall
  // "no tests yet" placeholder — which fades in over the dark background and
  // then swaps to the list mid-transition — before we actually know it's empty.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void getSpeedHistory().then((next) => {
      if (!active) return
      setEntries(next)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  const handleClear = (): void => {
    void clearSpeedHistory()
    setEntries([])
  }

  return (
    <Subpage
      title="Speed test history"
      description="Results from your past speed tests, newest first."
      onBack={onBack}
      action={
        entries.length > 0 ? (
          <Tooltip content="Clear history">
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              onClick={handleClear}
              aria-label="Clear history"
            >
              <TrashIcon size={15} />
            </button>
          </Tooltip>
        ) : undefined
      }
    >
      {!loaded ? null : entries.length === 0 ? (
        <div className="view-empty">
          <HistoryIcon size={28} className="section-placeholder-icon" />
          <p className="text-hint history-empty-text">
            No tests recorded yet. Results appear here each time you run a speed test.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {entries.map((entry, index) => (
            <HistoryCard key={`${entry.timestamp}-${index}`} entry={entry} />
          ))}
        </div>
      )}
    </Subpage>
  )
}
