import { useEffect, useRef, useState } from 'react'
import { splitSpeedMbps, formatLatencyMs, formatBand, formatSpeedMbps } from '@/lib/format'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import {
  clearSpeedHistory,
  formatHistoryTimestamp,
  getSpeedHistory,
  type SpeedHistoryEntry,
} from '@/features/speed/utils/speed-history'
import { Subpage } from '@/components/Subpage'
import { DotSeparator, InlineMeta } from '@/components/DotSeparator'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import { FAILED_PING } from '@/types'
import { EthernetIcon, GlobeIcon, HistoryIcon, MoreIcon, TrashIcon, WifiIcon } from '@/components/icons/Icons'
import { EmptyState } from '@/components/EmptyState'
import type { SpeedSeries } from '@/components/icons/DirectionIcon'
import { cx } from '@/lib/cx'
import styles from './SpeedHistoryView.module.css'

interface MetricProps {
  label: string
  value: string
  unit?: string
  series?: SpeedSeries
}

interface ConnectionBadgeStyle {
  Icon: typeof WifiIcon
  /** Shown when the entry has no network name. */
  fallbackName: string
}

/** A ping that came back: finite and below the backend's failed-ping sentinel. */
function isMeasuredLatency(ms: number): boolean {
  return Number.isFinite(ms) && ms < FAILED_PING.avgMs
}

function connectionBadgeStyle(connectionType: string): ConnectionBadgeStyle {
  if (connectionType === 'wifi') return { Icon: WifiIcon, fallbackName: 'Wi‑Fi' }
  if (connectionType === 'ethernet') return { Icon: EthernetIcon, fallbackName: 'Ethernet' }
  return { Icon: GlobeIcon, fallbackName: 'Unknown' }
}

function ConnectionBadge({ entry }: { entry: SpeedHistoryEntry }): JSX.Element {
  const { connectionType, networkName } = entry
  const { Icon, fallbackName } = connectionBadgeStyle(connectionType)
  const band = formatBand(entry.frequency)

  return (
    <span className={styles.conn} data-type={connectionType}>
      <Icon size={13} />
      <span className={styles.connName}>{networkName ?? fallbackName}</span>
      {band != null && (
        <>
          <DotSeparator />
          <span className={styles.connBand}>{band}</span>
        </>
      )}
    </span>
  )
}

function Metric({ label, value, unit, series }: MetricProps): JSX.Element {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>
        {series && <DirectionIcon series={series} size={13} />}
        <span className="field-label">{label}</span>
      </span>
      <span className={cx(styles.metricValue, 'num')}>
        {value}
        {unit && <span className={styles.metricUnit}> {unit}</span>}
      </span>
    </div>
  )
}

function HistoryCard({ entry }: { entry: SpeedHistoryEntry }): JSX.Element {
  const download = splitSpeedMbps(entry.downloadMbps)
  const upload = splitSpeedMbps(entry.uploadMbps)
  const hasValidPing = isMeasuredLatency(entry.latencyMs)

  return (
    <div className={cx(styles.card, 'surface')}>
      <div className={styles.cardHead}>
        <ConnectionBadge entry={entry} />
        <span className={styles.cardTime}>{formatHistoryTimestamp(entry.timestamp)}</span>
      </div>

      <div className={styles.cardMetrics}>
        <Metric label="Download" value={download.value} unit={download.unit} series="down" />
        <Metric label="Upload" value={upload.value} unit={upload.unit} series="up" />
        <Metric
          label="Ping"
          value={hasValidPing ? formatLatencyMs(entry.latencyMs).replace(' ms', '') : '—'}
          unit={hasValidPing ? 'ms' : undefined}
        />
      </div>

      <div className={styles.cardFooter}>
        <p className={cx(styles.footnote, 'num')}>
          <InlineMeta
            items={[
              <>Jitter {hasValidPing ? formatLatencyMs(entry.jitterMs) : '—'}</>,
              <>{entry.packetLoss}% loss</>,
            ]}
          />
          {entry.linkSpeedMbps != null && (
            <span className={styles.footnoteLink}>
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
function HistoryMenu({ onDelete }: { onDelete: () => void }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (event: MouseEvent): void => {
      const menu = menuRef.current
      if (menu && !menu.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleDelete = (): void => {
    setIsOpen(false)
    onDelete()
  }

  return (
    <div className={styles.menu} ref={menuRef}>
      <button
        type="button"
        className={styles.kebab}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="History options"
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <MoreIcon size={16} />
      </button>
      {isOpen && (
        <div className={styles.dropdown} role="menu">
          <button
            type="button"
            role="menuitem"
            className={cx(styles.menuItem, styles.isDanger)}
            onClick={handleDelete}
          >
            <TrashIcon size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function HistoryList({ entries }: { entries: SpeedHistoryEntry[] }): JSX.Element {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title="No speed tests yet"
        hint="Results appear here each time you run a speed test."
      />
    )
  }

  return (
    <div className={styles.list}>
      {entries.map((entry, index) => (
        <HistoryCard key={`${entry.timestamp}-${index}`} entry={entry} />
      ))}
    </div>
  )
}

export function SpeedHistoryView(): JSX.Element {
  const { back } = useNavigation()
  const [entries, setEntries] = useState<SpeedHistoryEntry[]>([])
  // History loads over an async IPC call, so `entries` is empty on the first
  // frame. Track whether that load has resolved so we don't flash the tall
  // "no tests yet" placeholder — which fades in over the dark background and
  // then swaps to the list mid-transition — before we actually know it's empty.
  const [isLoaded, setIsLoaded] = useState(false)
  // Re-load whenever a test finishes so a result recorded while this view is
  // open shows up without a manual refresh. `completedAt` changes on each
  // completed run, driving the effect below.
  const { completedAt } = useSpeedTest()

  useEffect(() => {
    let isActive = true
    void getSpeedHistory().then((loaded) => {
      if (!isActive) return
      setEntries(loaded)
      setIsLoaded(true)
    })
    return () => {
      isActive = false
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
      onBack={back}
      action={entries.length > 0 ? <HistoryMenu onDelete={handleClear} /> : undefined}
    >
      {isLoaded && <HistoryList entries={entries} />}
    </Subpage>
  )
}
