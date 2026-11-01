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
import { EthernetIcon, GlobeIcon, MoreVerticalIcon, TrashIcon, WifiIcon } from '@/components/icons/Icons'
import { EmptyState } from '@/components/EmptyState'
import type { SpeedSeries } from '@/components/icons/DirectionIcon'
import { useMenu } from '@/hooks/useMenu'

/** Connection badge, tinted by medium. */
const connVariants = cva('inline-flex min-w-0 items-center gap-6 text-sm font-medium', {
  variants: {
    type: {
      wifi: 'text-series-down',
      ethernet: 'text-status-positive',
      unknown: 'text-secondary',
    },
  },
})

// Header overflow menu: a kebab that opens a small dropdown with Delete. Mirrors
// the per-row menu on the manage-services page so the two read the same.
const KEBAB = cx(
  'inline-flex size-[30px] items-center justify-center rounded-sm text-tertiary',
  'transition-[color,background] duration-(--duration-fast) ease-in-out',
  'hover:bg-hover hover:text-primary aria-expanded:bg-hover aria-expanded:text-primary',
)

const DROPDOWN = cx(
  'animate-menu-in absolute top-[calc(100%+4px)] right-0 z-20 flex min-w-[112px] flex-col gap-2 p-4',
  'rounded-sm border border-line-strong bg-surface shadow-raised',
)

const menuItemVariants = cva(
  [
    'flex w-full items-center gap-8 rounded-xs p-8 text-left text-sm font-medium',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
    // Items fill the menu edge to edge, so the ring goes inside the item.
    'focus-visible:outline-offset-(--focus-inset)',
  ],
  {
    variants: {
      isDanger: {
        true: 'text-negative hover:bg-[color-mix(in_srgb,var(--status-negative)_14%,transparent)]',
        false: 'text-secondary hover:bg-hover hover:text-primary',
      },
    },
    defaultVariants: { isDanger: false },
  },
)

interface MetricProps {
  label: string
  value: string
  unit?: string
  series?: SpeedSeries
}

interface ConnectionBadgeStyle {
  Icon: typeof WifiIcon
  /** The badge's tint: the medium's colour, or plain for an unknown one. */
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
  return { Icon: GlobeIcon, type: 'unknown', fallbackName: 'Unknown' }
}

function ConnectionBadge({ entry }: { entry: SpeedHistoryEntry }): JSX.Element {
  const { connectionType, networkName } = entry
  const { Icon, type, fallbackName } = connectionBadgeStyle(connectionType)
  const band = formatBand(entry.frequency)

  return (
    <span className={connVariants({ type })}>
      <Icon size={13} />
      <span className="min-w-0 truncate text-primary">{networkName ?? fallbackName}</span>
      {band != null && (
        <>
          <DotSeparator />
          {/* Secondary to the name: the name truncates first, the band holds its width. */}
          <span className="shrink-0 text-xs font-regular text-tertiary">{band}</span>
        </>
      )}
    </span>
  )
}

function Metric({ label, value, unit, series }: MetricProps): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dt className="flex items-center gap-6">
        {series && <DirectionIcon series={series} size={13} />}
        <span className="text-overline">{label}</span>
      </dt>
      <dd className="num text-2xl font-semibold text-primary">
        {value}
        {unit && <span className="font-sans text-xs font-regular text-secondary"> {unit}</span>}
      </dd>
    </div>
  )
}

// Closing banner on the chrome panel, matching the capabilities detail card's
// verdict strip: framed on three sides with the inset colour, rounded to the card's
// bottom corners. The horizontal padding is trimmed by the border width so its
// content stays aligned with the metrics grid above.
const CARD_FOOTER = cx(
  '-mx-(--card-body-padding) mt-8 px-[calc(var(--card-body-padding)-1px)] py-12',
  'rounded-b-lg border border-t-0 border-inset bg-base',
)

function HistoryCard({ entry }: { entry: SpeedHistoryEntry }): JSX.Element {
  const download = splitSpeedMbps(entry.downloadMbps)
  const upload = splitSpeedMbps(entry.uploadMbps)
  const hasValidPing = isMeasuredLatency(entry.latencyMs)

  return (
    // No bottom padding: the footer banner bleeds to the card's bottom edge, and
    // overflow clips it to the rounded corners.
    <li className="surface overflow-hidden px-(--card-body-padding) pt-(--card-body-padding)">
      <div className="mb-12 flex items-center justify-between gap-12">
        <ConnectionBadge entry={entry} />
        <time className="shrink-0 text-xs text-tertiary" dateTime={new Date(entry.timestamp).toISOString()}>
          {formatHistoryTimestamp(entry.timestamp)}
        </time>
      </div>

      <dl className="grid grid-cols-3 gap-12">
        <Metric label="Download" value={download.value} unit={download.unit} series="down" />
        <Metric label="Upload" value={upload.value} unit={upload.unit} series="up" />
        <Metric
          label="Ping"
          value={hasValidPing ? formatLatencyMs(entry.latencyMs).replace(' ms', '') : '—'}
          unit={hasValidPing ? 'ms' : undefined}
        />
      </dl>

      <div className={CARD_FOOTER}>
        <p className="num flex w-full min-w-0 items-center justify-between gap-12 text-xs text-tertiary">
          <InlineMeta
            items={[
              <>Jitter {hasValidPing ? formatLatencyMs(entry.jitterMs) : '—'}</>,
              <>{entry.packetLoss}% loss</>,
            ]}
          />
          {entry.linkSpeedMbps != null && (
            <span className="ml-auto shrink-0">
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
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className={KEBAB}
        {...triggerProps}
        aria-label="History options"
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <MoreVerticalIcon size={16} />
      </button>
      {isOpen && (
        <div className={DROPDOWN} {...menuProps}>
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
        title="No speed tests yet"
        hint="Run a test to start your history."
      />
    )
  }

  return (
    <ul role="list" className="flex flex-col gap-10">
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
  const completedAt = useSpeedTest((test) => test.completedAt)

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
