import { cva, cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import {
  formatBand,
  formatDateTime,
  formatLatencyMs,
  formatSpeedMbps,
  splitLatencyMs,
  splitSpeedMbps,
} from '@/lib/format'
import { isMeasuredLatency, type SpeedHistoryEntry } from '@/types'
import {
  Card,
  DirectionIcon,
  DotSeparator,
  EthernetIcon,
  GlobeIcon,
  InlineMeta,
  NoValue,
  type SpeedSeries,
  type VariantOf,
  WifiIcon,
} from '@/ui'

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
  value: ReactNode
  unit?: string
  series?: SpeedSeries
}

type ConnectionBadgeStyle = {
  Icon: typeof WifiIcon
  /** The badge's tint: the medium's colour, or plain for an unknown one. */
  type: VariantOf<typeof connVariants, 'type'>
  /** Shown when the entry has no network name. */
  fallbackName: string
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

// Like the capability verdict strip: the padding gives back the 1px border so
// the content stays aligned with the grid above.
const CARD_FOOTER = cx(
  '-mx-(--card-body-padding) mt-8 px-[calc(var(--card-body-padding)-1px)] py-12',
  'rounded-b-lg border border-t-0 border-inset bg-base',
)

export function HistoryCard({ entry }: { entry: SpeedHistoryEntry }) {
  const download = splitSpeedMbps(entry.downloadMbps)
  const upload = splitSpeedMbps(entry.uploadMbps)
  const hasValidPing = isMeasuredLatency(entry.latencyMs)
  const ping = hasValidPing ? splitLatencyMs(entry.latencyMs) : null

  return (
    // No bottom padding: the footer bleeds to the card's rounded bottom edge.
    <Card as="li">
      <div className="px-(--card-body-padding) pt-(--card-body-padding)">
        <div className="mb-12 flex items-center justify-between gap-12">
          <ConnectionBadge entry={entry} />
          <time className="shrink-0 text-xs text-tertiary" dateTime={new Date(entry.timestamp).toISOString()}>
            {formatDateTime(entry.timestamp)}
          </time>
        </div>

        <dl className="grid grid-cols-3 gap-12">
          <Metric label="Download" value={download.value} unit={download.unit} series="down" />
          <Metric label="Upload" value={upload.value} unit={upload.unit} series="up" />
          <Metric label="Ping" value={ping?.value ?? <NoValue label="Not measured" />} unit={ping?.unit} />
        </dl>

        <div className={CARD_FOOTER}>
          <p className="num flex w-full min-w-0 items-center justify-between gap-12 text-xs text-tertiary">
            <InlineMeta
              items={[
                <>
                  Jitter {(hasValidPing ? formatLatencyMs(entry.jitterMs) : null) ?? <NoValue label="Not measured" />}
                </>,
                <>{entry.packetLoss}% loss</>,
              ]}
            />
            {entry.linkSpeedMbps != null && (
              <span className="ml-auto shrink-0">
                Link speed <span className="num">{formatSpeedMbps(entry.linkSpeedMbps) ?? <NoValue />}</span>
              </span>
            )}
          </p>
        </div>
      </div>
    </Card>
  )
}
