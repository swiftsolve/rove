import { useEffect, useState } from 'react'
import { cva, cx, type VariantProps } from 'class-variance-authority'
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
import { useMenu } from '@/hooks/useMenu'
import styles from './SpeedHistoryView.module.css'

/** Connection badge, tinted by medium. */
const connVariants = cva(styles.conn, {
  variants: {
    type: { wifi: styles.typeWifi, ethernet: styles.typeEthernet },
  },
})

const menuItemVariants = cva(styles.menuItem, {
  variants: {
    isDanger: { true: styles.isDanger },
  },
})

interface MetricProps {
  label: string
  value: string
  unit?: string
  series?: SpeedSeries
}

interface ConnectionBadgeStyle {
  Icon: typeof WifiIcon
  /** The badge's tint; none for an unknown medium. */
  type: VariantProps<typeof connVariants>['type']
  /** Shown when the entry has no network name. */
  fallbackName: string
}

/** A ping that came back: finite and below the backend's failed-ping sentinel. */
function isMeasuredLatency(ms: number): boolean {
  return Number.isFinite(ms) && ms < FAILED_PING.avgMs
}

function connectionBadgeStyle(connectionType: string): ConnectionBadgeStyle {
  if (connectionType === 'wifi') return { Icon: WifiIcon, type: 'wifi', fallbackName: 'Wi‑Fi' }
  if (connectionType === 'ethernet') {
    return { Icon: EthernetIcon, type: 'ethernet', fallbackName: 'Ethernet' }
  }
  return { Icon: GlobeIcon, type: null, fallbackName: 'Unknown' }
}

function ConnectionBadge({ entry }: { entry: SpeedHistoryEntry }): JSX.Element {
  const { connectionType, networkName } = entry
  const { Icon, type, fallbackName } = connectionBadgeStyle(connectionType)
  const band = formatBand(entry.frequency)

  return (
    <span className={connVariants({ type })}>
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
      <dt className={styles.metricLabel}>
        {series && <DirectionIcon series={series} size={13} />}
        <span className="field-label">{label}</span>
      </dt>
      <dd className={cx(styles.metricValue, 'num')}>
        {value}
        {unit && <span className={styles.metricUnit}> {unit}</span>}
      </dd>
    </div>
  )
}

function HistoryCard({ entry }: { entry: SpeedHistoryEntry }): JSX.Element {
  const download = splitSpeedMbps(entry.downloadMbps)
  const upload = splitSpeedMbps(entry.uploadMbps)
  const hasValidPing = isMeasuredLatency(entry.latencyMs)

  return (
    <li className={cx(styles.card, 'surface')}>
      <div className={styles.cardHead}>
        <ConnectionBadge entry={entry} />
        <time className={styles.cardTime} dateTime={new Date(entry.timestamp).toISOString()}>
          {formatHistoryTimestamp(entry.timestamp)}
        </time>
      </div>

      <dl className={styles.cardMetrics}>
        <Metric label="Download" value={download.value} unit={download.unit} series="down" />
        <Metric label="Upload" value={upload.value} unit={upload.unit} series="up" />
        <Metric
          label="Ping"
          value={hasValidPing ? formatLatencyMs(entry.latencyMs).replace(' ms', '') : '—'}
          unit={hasValidPing ? 'ms' : undefined}
        />
      </dl>

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
    </li>
  )
}

/** The header overflow menu: a kebab that opens a dropdown with Delete (clear
 *  all history). Closes on outside click or Escape. */
function HistoryMenu({ onDelete }: { onDelete: () => void }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const { rootRef, triggerProps, menuProps } = useMenu(isOpen, () => setIsOpen(false))

  const handleDelete = (): void => {
    setIsOpen(false)
    onDelete()
  }

  return (
    <div className={styles.menu} ref={rootRef}>
      <button
        type="button"
        className={styles.kebab}
        {...triggerProps}
        aria-label="History options"
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <MoreIcon size={16} />
      </button>
      {isOpen && (
        <div className={styles.dropdown} {...menuProps}>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={menuItemVariants({ isDanger: true })}
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
    <ul role="list" className={styles.list}>
      {entries.map((entry, index) => (
        <HistoryCard key={`${entry.timestamp}-${index}`} entry={entry} />
      ))}
    </ul>
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
