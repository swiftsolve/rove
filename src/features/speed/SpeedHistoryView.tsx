import { cva, cx } from 'class-variance-authority'
import { splitSpeedMbps, formatLatencyMs, formatBand, formatSpeedMbps } from '@/lib/format'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedHistory } from '@/features/speed/hooks/useSpeedHistory'
import { formatHistoryTimestamp, type SpeedHistoryEntry } from '@/features/speed/utils/speed-history'
import {
  Card,
  DirectionIcon,
  DotSeparator,
  EmptyState,
  EthernetIcon,
  GlobeIcon,
  InlineMeta,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
  TrashIcon,
  WifiIcon,
  type SpeedSeries,
  type VariantOf,
} from '@/ui'
import { FAILED_PING } from '@/types'

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

type MetricProps = {
  label: string
  value: string
  unit?: string
  series?: SpeedSeries
}

interface ConnectionBadgeStyle {
  Icon: typeof WifiIcon
  /** The badge's tint: the medium's colour, or plain for an unknown one. */
  type: VariantOf<typeof connVariants, 'type'>
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

function ConnectionBadge({ entry }: { entry: SpeedHistoryEntry }) {
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

function Metric({ label, value, unit, series }: MetricProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dt className="flex items-center gap-6">
        {series && <DirectionIcon series={series} size={13} />}
        <span className="type-overline text-tertiary">{label}</span>
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

function HistoryCard({ entry }: { entry: SpeedHistoryEntry }) {
  const download = splitSpeedMbps(entry.downloadMbps)
  const upload = splitSpeedMbps(entry.uploadMbps)
  const hasValidPing = isMeasuredLatency(entry.latencyMs)

  return (
    // No bottom padding: the footer banner bleeds to the card's bottom edge, and
    // overflow clips it to the rounded corners.
    <Card as="li">
      <div className="px-(--card-body-padding) pt-(--card-body-padding)">
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
      </div>
    </Card>
  )
}

/** The header overflow menu: Delete, which clears all history. */
function HistoryMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <Menu>
      <MenuTrigger label="History options" />
      <MenuContent>
        <MenuItem icon={TrashIcon} tone="negative" onClick={onDelete}>
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function HistoryList({ entries }: { entries: SpeedHistoryEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No speed tests yet" description="Run a test to start your history." />
  }

  return (
    <ul role="list" className="flex flex-col gap-10">
      {/* Keyed by when the result was saved, one per test: a new result on top
          leaves the rows below with the keys they had. */}
      {entries.map((entry) => (
        <HistoryCard key={entry.timestamp} entry={entry} />
      ))}
    </ul>
  )
}

export function SpeedHistoryView() {
  const { back } = useNavigation()
  // Undefined until the first read lands, so the tall "no tests yet"
  // placeholder doesn't flash up (and swap to the list mid-transition) before
  // we know the history is empty.
  const { entries, clear } = useSpeedHistory()

  return (
    <div className="page">
      <PageHeader
        title="Speed Test Results"
        description="Results from your past speed tests, newest first."
        onBack={back}
        actions={entries != null && entries.length > 0 ? <HistoryMenu onDelete={clear} /> : undefined}
      />
      {entries != null && <HistoryList entries={entries} />}
    </div>
  )
}
