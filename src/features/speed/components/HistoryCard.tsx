import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { ConnectionIcon } from '@/features/speed/components/ConnectionIcon'
import { connectionKind, connectionName } from '@/features/speed/utils/connection'
import { isMeasuredLatency, type SpeedHistoryEntry } from '@/types'
import { Card, DirectionIcon, DotSeparator, InlineMeta, NoValue, type SpeedSeries } from '@/ui'
import {
  formatBand,
  formatDateTime,
  formatLatencyMs,
  formatSpeedMbps,
  splitLatencyMs,
  splitSpeedMbps,
} from '@/utils/format'

/** Connection badge; its icon is tinted by medium. */
const CONNECTION = 'inline-flex min-w-0 items-center gap-6 type-body-medium'

type MetricProps = {
  label: string
  value: ReactNode
  unit?: string
  series?: SpeedSeries
}

function ConnectionBadge({ entry }: { entry: SpeedHistoryEntry }) {
  const kind = connectionKind(entry.connectionType)
  const band = formatBand(entry.frequency)

  return (
    <span className={CONNECTION}>
      <ConnectionIcon kind={kind} size={13} />
      <span className="min-w-0 truncate text-primary">{connectionName(kind, entry.networkName)}</span>
      {band != null && (
        <>
          <DotSeparator />
          {/* Secondary to the name: the name truncates first, the band holds its width. */}
          <span className="type-caption shrink-0 text-tertiary">{band}</span>
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
        <span className="type-body-medium text-tertiary">{label}</span>
      </dt>
      <dd className="type-stat leading-body metric-value">
        {value}
        {unit && <span className="type-caption text-secondary"> {unit}</span>}
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
  const jitter = hasValidPing ? formatLatencyMs(entry.jitterMs) : null

  return (
    // No bottom padding: the footer bleeds to the card's rounded bottom edge.
    <Card as="li">
      <div className="px-(--card-body-padding) pt-(--card-body-padding)">
        <div className="mb-12 flex items-center justify-between gap-12">
          <ConnectionBadge entry={entry} />
          <time className="type-caption shrink-0 text-tertiary" dateTime={new Date(entry.timestamp).toISOString()}>
            {formatDateTime(entry.timestamp)}
          </time>
        </div>

        <dl className="grid grid-cols-3 gap-12">
          <Metric label="Download" value={download.value} unit={download.unit} series="down" />
          <Metric label="Upload" value={upload.value} unit={upload.unit} series="up" />
          <Metric label="Ping" value={ping?.value ?? <NoValue label="Not measured" />} unit={ping?.unit} />
        </dl>

        <div className={CARD_FOOTER}>
          <p className="type-caption flex w-full min-w-0 items-center justify-between gap-12 num text-tertiary">
            <InlineMeta
              items={[<>Jitter {jitter ?? <NoValue label="Not measured" />}</>, <>{entry.packetLoss}% loss</>]}
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
