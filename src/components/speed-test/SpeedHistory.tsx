import { useEffect, useRef, useState } from 'react'
import { splitSpeedMbps, formatLatencyMs, formatBand, formatSpeedMbps } from '@/lib/format'
import { useSpeedTest } from '@/hooks/useSpeedTest'
import {
  clearSpeedHistory,
  formatHistoryTimestamp,
  getSpeedHistory,
  type SpeedHistoryEntry,
} from '@/components/speed-test/speed-history'
import Subpage from '@/components/ui/Subpage'
import { DotSeparator, InlineMeta } from '@/components/ui/DotSeparator'
import DirectionIcon from '@/components/ui/DirectionIcon'
import type { SpeedSeries } from '@/components/traffic/SpeedReadout'
import { EthernetIcon, GlobeIcon, HistoryIcon, MoreIcon, TrashIcon, WifiIcon } from '@/components/ui/Icons'
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
  const band = formatBand(entry.frequency)

  return (
    <span className={`history-conn conn-${connectionType}`}>
      <Icon size={13} />
      <span className="history-conn-name">{networkName ?? fallback}</span>
      {band != null && (
        <>
          <DotSeparator />
          <span className="history-conn-band">{band}</span>
        </>
      )}
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

      <div className="history-card-footer">
        <p className="history-footnote num">
          <InlineMeta
            items={[
              <>Jitter {validPing ? formatLatencyMs(entry.jitterMs) : '—'}</>,
              <>{entry.packetLoss}% loss</>,
            ]}
          />
          {entry.linkSpeedMbps != null && (
            <span className="history-footnote-link">
              Link speed <span className="num">{formatSpeedMbps(entry.linkSpeedMbps)}</span>
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

/** The header overflow menu: a kebab that opens a dropdown with Delete (clear
 *  all history). Closes on outside click or Escape. */
function HistoryMenu({ onDelete }: { readonly onDelete: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="history-menu" ref={ref}>
      <button
        type="button"
        className="history-kebab"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="History options"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon size={16} />
      </button>
      {open && (
        <div className="history-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="history-menuitem is-danger"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <TrashIcon size={14} />
            Delete
          </button>
        </div>
      )}
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
  // Re-load whenever a test finishes so a result recorded while this view is
  // open shows up without a manual refresh. `completedAt` changes on each
  // completed run, driving the effect below.
  const { completedAt } = useSpeedTest()

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
  }, [completedAt])

  const handleClear = (): void => {
    void clearSpeedHistory()
    setEntries([])
  }

  return (
    <Subpage
      title="Speed Test Results"
      description="Results from your past speed tests, newest first."
      onBack={onBack}
      action={entries.length > 0 ? <HistoryMenu onDelete={handleClear} /> : undefined}
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
