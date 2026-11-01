import { memo } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { NetworkInfo } from '@/types'
import { FAILED_PING, getLinkCapacityMbps, isWifiNetwork } from '@/types'
import { formatBand, formatLatencyMs, formatSpeedMbps, splitSpeedMbps } from '@/lib/format'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { Card, CardBody, CardHeader, DirectionIcon, EthernetIcon, InlineMeta, SpeedIcon, WifiIcon, useCountUp, type SpeedSeries } from '@/ui'
import type { SpeedTestConnection } from '@/features/speed/types'
import { WavyProgress } from '@/features/speed/components/WavyProgress'
import {
  DOWNLOAD_PHASE_START_PCT,
  UPLOAD_PHASE_START_PCT,
} from '@/features/speed/utils/progress-fill'
import { testStatusText } from '@/features/speed/utils/test-status'

/** The connection the footer names, its glyph tinted by medium. */
const connVariants = cva('inline-flex items-center gap-6 font-medium text-secondary', {
  variants: {
    type: { wifi: '[&_svg]:text-series-down', ethernet: '[&_svg]:text-status-positive' },
  },
})

/** A hero speed's digits; muted "…" before any test has run, so the labels lead
 *  and the "…" reads as pending, not zeroed. */
const speedValueVariants = cva('metric-value', {
  variants: {
    isPlaceholder: { true: 'text-tertiary' },
  },
})

const substatValueVariants = cva(['num', 'text-md font-medium'], {
  variants: {
    isEmpty: { true: 'text-tertiary', false: 'text-primary' },
  },
})

// Full-bleed inset panel at the card bottom, the same treatment as the live
// throughput chart.
const INSET_PANEL = cx(
  '-mx-(--card-body-padding) mt-16 -mb-(--card-body-padding)',
  'bg-inset p-(--card-body-padding)',
)

/** A latency that came back: finite and below the backend's failed-ping sentinel. */
function isMeasuredLatency(ms: number): boolean {
  return Number.isFinite(ms) && ms < FAILED_PING.avgMs
}

/**
 * What a hero cell shows. While testing, a direction shows its live peak once
 * its phase has begun, and 0 before that so unset cells read as zero;
 * otherwise it shows the last result.
 */
function heroCellMbps(
  isTesting: boolean,
  progressPct: number,
  phaseStartPct: number,
  liveMbps: number,
  resultMbps: number | undefined,
): number | null {
  if (!isTesting) return resultMbps ?? null
  return progressPct >= phaseStartPct ? liveMbps : 0
}

/** A substat's text: the measured value, or a placeholder when there's none. */
function substatText(measured: string | null, isEmpty: boolean): string {
  if (measured != null) return measured
  return isEmpty ? '…' : '—'
}

function connectionFromNetworkInfo(info: NetworkInfo | null): SpeedTestConnection | null {
  if (!info) return null
  if (isWifiNetwork(info)) {
    return { type: 'wifi', name: info.ssid ?? null, band: formatBand(info.frequency) }
  }
  if (info.connectionType === 'ethernet') {
    return { type: 'ethernet', name: null, band: null }
  }
  return null
}

function ConnectionTag({ connection }: { connection: SpeedTestConnection }): JSX.Element {
  const name = connection.name ?? (connection.type === 'wifi' ? 'Wi‑Fi' : 'Ethernet')
  return (
    <span className={connVariants({ type: connection.type })}>
      {connection.type === 'wifi' ? <WifiIcon size={12} /> : <EthernetIcon size={12} />}
      <InlineMeta items={[name, connection.band]} />
    </span>
  )
}

function SpeedCell({
  mbps,
  isPlaceholder = false,
}: {
  mbps: number | null
  isPlaceholder?: boolean
}): JSX.Element {
  const animatedMbps = useCountUp(mbps ?? 0)
  const { value, unit } = splitSpeedMbps(animatedMbps)

  return (
    <dd className="metric num">
      <span className={speedValueVariants({ isPlaceholder })}>{isPlaceholder ? '…' : value}</span>
      {!isPlaceholder && <span className="metric-unit">{unit}</span>}
    </dd>
  )
}

/** The running test's phase and percentage. Reads the progress itself, so a
 *  tick re-renders this strip rather than the whole card. */
function TestProgress(): JSX.Element {
  const progress = useSpeedTest((test) => test.progress)
  const runId = useSpeedTest((test) => test.runId)
  return (
    <div className={cx(INSET_PANEL, 'flex flex-col gap-8')}>
      <div className="flex items-baseline justify-between gap-12">
        <span className="text-sm leading-body-small text-secondary">{progress.message || 'Starting…'}</span>
        <span className="num text-md font-regular text-accent">{Math.round(progress.progress)}%</span>
      </div>
      <div
        className="w-full"
        role="progressbar"
        aria-label="Speed test progress"
        aria-valuenow={Math.round(progress.progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <WavyProgress progress={progress.progress} runId={runId} />
      </div>
    </div>
  )
}

/** Each phase and the result, for screen readers. Reads the test itself, like `TestProgress`. */
function TestStatus(): JSX.Element {
  const text = useSpeedTest((test) => testStatusText(test.isTesting, test.progress, test.internetSpeed))
  return (
    <p className="sr-only" role="status">
      {text}
    </p>
  )
}

function HeroCell({
  label,
  series,
  mbps,
  isPlaceholder,
}: {
  label: string
  series: SpeedSeries
  mbps: number | null
  isPlaceholder: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <dt className="flex items-center gap-6">
        <DirectionIcon series={series} />
        <span className="text-overline">{label}</span>
      </dt>
      <SpeedCell mbps={mbps} isPlaceholder={isPlaceholder} />
    </div>
  )
}

function Substat({
  label,
  text,
  isEmpty,
}: {
  label: string
  text: string
  isEmpty: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <dt className="text-overline">{label}</dt>
      <dd className={substatValueVariants({ isEmpty })}>{text}</dd>
    </div>
  )
}

function ResultFooter({
  connection,
  linkCapacityMbps,
}: {
  connection: SpeedTestConnection | null
  linkCapacityMbps: number | null
}): JSX.Element {
  return (
    // The strip under the results: connection left, link speed right. The text
    // size comes from .text-caption.
    <div className={cx(INSET_PANEL, 'flex items-center')}>
      <p className="text-caption flex w-full min-w-0 items-center justify-between gap-12">
        {connection != null && <ConnectionTag connection={connection} />}
        {linkCapacityMbps != null && (
          <span className="ml-auto shrink-0">
            Link speed <span className="num">{formatSpeedMbps(linkCapacityMbps)}</span>
          </span>
        )}
      </p>
    </div>
  )
}

export const SpeedTestCard = memo(function SpeedTestCard(): JSX.Element {
  const { info } = useNetwork()
  // Each pick is its own subscription, so the card re-renders only when one of
  // them changes: not on a progress tick, which only the progress strip shows.
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const error = useSpeedTest((test) => test.error)
  const testLinkCapacityMbps = useSpeedTest((test) => test.linkCapacityMbps)
  const runConnection = useSpeedTest((test) => test.runConnection)
  // The hero cells: the live (running-peak) throughput while a test runs.
  const downloadMbps = useSpeedTest((test) =>
    heroCellMbps(
      test.isTesting,
      test.progress.progress,
      DOWNLOAD_PHASE_START_PCT,
      test.livePeakDownloadMbps,
      test.internetSpeed?.downloadMbps,
    ),
  )
  const uploadMbps = useSpeedTest((test) =>
    heroCellMbps(
      test.isTesting,
      test.progress.progress,
      UPLOAD_PHASE_START_PCT,
      test.livePeakUploadMbps,
      test.internetSpeed?.uploadMbps,
    ),
  )
  const canTest = useCanRunSpeedTest()

  const hasResults = internetSpeed != null
  // The footer describes the connection the last result was measured on, and
  // falls back to the live connection before any test has run.
  const connection =
    hasResults && runConnection != null ? runConnection : connectionFromNetworkInfo(info)
  const linkCapacityMbps =
    hasResults && testLinkCapacityMbps != null
      ? testLinkCapacityMbps
      : info ? getLinkCapacityMbps(info) : null
  // Empty state: connected and idle, but no test has run yet. We still lay out
  // the full metric grid with placeholder values so the empty and filled states
  // share the same structure.
  const isEmpty = !hasResults && !isTesting
  const hasFooterInfo = connection != null || linkCapacityMbps != null

  const measuredPing =
    internetSpeed && isMeasuredLatency(internetSpeed.latencyMs)
      ? formatLatencyMs(internetSpeed.latencyMs)
      : null
  const measuredJitter =
    internetSpeed && isMeasuredLatency(internetSpeed.jitterMs)
      ? formatLatencyMs(internetSpeed.jitterMs)
      : null
  const measuredLoss = internetSpeed ? `${internetSpeed.packetLoss}%` : null

  return (
    <Card>
      <CardHeader
        title="Speed test"
        icon={<SpeedIcon size={15} />}
        actions={isEmpty && canTest ? <span className="text-caption">No tests yet</span> : undefined}
      />
      <CardBody>
        {error && <p className="inline-error" role="alert">{error}</p>}

        <dl className="grid grid-cols-2 gap-16">
          <HeroCell label="Download" series="down" mbps={downloadMbps} isPlaceholder={isEmpty} />
          <HeroCell label="Upload" series="up" mbps={uploadMbps} isPlaceholder={isEmpty} />
        </dl>

        {!isTesting && (
          <dl className="mt-16 grid grid-cols-3 gap-16">
            <Substat label="Ping" text={substatText(measuredPing, isEmpty)} isEmpty={isEmpty} />
            <Substat label="Jitter" text={substatText(measuredJitter, isEmpty)} isEmpty={isEmpty} />
            <Substat label="Loss" text={substatText(measuredLoss, isEmpty)} isEmpty={isEmpty} />
          </dl>
        )}

        {isTesting && <TestProgress />}
        {!isTesting && hasResults && hasFooterInfo && (
          <ResultFooter connection={connection} linkCapacityMbps={linkCapacityMbps} />
        )}

        {/* Always mounted so screen readers hear each phase and the result as they
            land; the visible readouts count up every frame, so they can't be live. */}
        <TestStatus />
      </CardBody>
    </Card>
  )
})
