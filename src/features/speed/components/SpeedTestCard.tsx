import { cva, cx } from 'class-variance-authority'
import { memo, type ReactNode } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { WavyProgress } from '@/features/speed/components/WavyProgress'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import type { SpeedTestConnection } from '@/features/speed/types'
import { DOWNLOAD_PHASE_START_PCT, UPLOAD_PHASE_START_PCT } from '@/features/speed/utils/progress-fill'
import { testStatusText } from '@/features/speed/utils/test-status'
import { formatBand, formatLatencyMs, formatSpeedMbps, splitSpeedMbps } from '@/lib/format'
import type { NetworkInfo } from '@/types'
import { getLinkCapacityMbps, isMeasuredLatency, isWifiNetwork } from '@/types'
import {
  Card,
  CardBody,
  CardHeader,
  DirectionIcon,
  EthernetIcon,
  InlineMeta,
  NoValue,
  SpeedIcon,
  type SpeedSeries,
  useCountUp,
  WifiIcon,
} from '@/ui'

/** The connection the footer names, its icon tinted by medium. */
const connVariants = cva('inline-flex items-center gap-6 font-medium text-secondary', {
  variants: {
    type: { wifi: '[&_svg]:text-series-down', ethernet: '[&_svg]:text-status-positive' },
  },
})

/** A hero speed's digits; muted "…" before any test has run, so the labels lead
 *  and the "…" reads as pending, not zeroed. */
const speedValueVariants = cva('type-number-display metric-value', {
  variants: {
    isPlaceholder: { true: 'text-tertiary' },
  },
})

const substatValueVariants = cva(['num', 'text-md font-medium'], {
  variants: {
    isEmpty: { true: 'text-tertiary', false: 'text-primary' },
  },
  defaultVariants: { isEmpty: false },
})

const INSET_PANEL = cx('-mx-(--card-body-padding) mt-16 -mb-(--card-body-padding)', 'bg-inset p-(--card-body-padding)')

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

/** A substat's value: the measured one, "…" before any test, else a NoValue bar. */
function substatValue(measured: string | null, isEmpty: boolean): ReactNode {
  if (measured != null) return measured
  return isEmpty ? '…' : <NoValue label="Not measured" />
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

function ConnectionTag({ connection }: { connection: SpeedTestConnection }) {
  const name = connection.name ?? (connection.type === 'wifi' ? 'Wi‑Fi' : 'Ethernet')
  return (
    <span className={connVariants({ type: connection.type })}>
      {connection.type === 'wifi' ? <WifiIcon size={12} /> : <EthernetIcon size={12} />}
      <InlineMeta items={[name, connection.band]} />
    </span>
  )
}

function SpeedCell({ mbps, isPlaceholder = false }: { mbps: number | null; isPlaceholder?: boolean }) {
  const animatedMbps = useCountUp(mbps ?? 0)
  const { value, unit } = splitSpeedMbps(animatedMbps)

  return (
    <dd className="metric num">
      <span className={speedValueVariants({ isPlaceholder })}>{isPlaceholder ? '…' : value}</span>
      {!isPlaceholder && <span className="type-body-small metric-unit">{unit}</span>}
    </dd>
  )
}

/** The running test's phase and percentage. Reads the progress itself, so a
 *  tick re-renders this strip rather than the whole card. */
function TestProgress() {
  const progress = useSpeedTest((test) => test.progress)
  const runId = useSpeedTest((test) => test.runId)
  return (
    <div className={cx(INSET_PANEL, 'flex flex-col gap-8')}>
      <div className="flex items-baseline justify-between gap-12">
        <span className="type-body-small text-secondary">{progress.message || 'Starting…'}</span>
        <span className="num text-md font-regular text-accent-text">{Math.round(progress.progress)}%</span>
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
function TestStatus() {
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
}) {
  return (
    <div className="flex flex-col gap-8">
      <dt className="flex items-center gap-6">
        <DirectionIcon series={series} />
        <span className="type-overline text-tertiary">{label}</span>
      </dt>
      <SpeedCell mbps={mbps} isPlaceholder={isPlaceholder} />
    </div>
  )
}

function Substat({ label, value, isEmpty }: { label: string; value: ReactNode; isEmpty: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <dt className="type-overline text-tertiary">{label}</dt>
      <dd className={substatValueVariants({ isEmpty })}>{value}</dd>
    </div>
  )
}

function ResultFooter({
  connection,
  linkCapacityMbps,
}: {
  connection: SpeedTestConnection | null
  linkCapacityMbps: number | null
}) {
  return (
    <div className={cx(INSET_PANEL, 'flex items-center')}>
      <p className="type-caption text-tertiary flex w-full min-w-0 items-center justify-between gap-12">
        {connection != null && <ConnectionTag connection={connection} />}
        {linkCapacityMbps != null && (
          <span className="ml-auto shrink-0">
            Link speed <span className="num">{formatSpeedMbps(linkCapacityMbps) ?? <NoValue />}</span>
          </span>
        )}
      </p>
    </div>
  )
}

export const SpeedTestCard = memo(function SpeedTestCard() {
  const { info } = useNetwork()
  // Each pick is its own subscription, so the card re-renders only when one of
  // them changes: not on a progress tick, which only the progress strip shows.
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const error = useSpeedTest((test) => test.error)
  const testLinkCapacityMbps = useSpeedTest((test) => test.linkCapacityMbps)
  const runConnection = useSpeedTest((test) => test.runConnection)
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
  // The connection the result was measured on, else the live one before any test.
  const connection = hasResults && runConnection != null ? runConnection : connectionFromNetworkInfo(info)
  const linkCapacityMbps =
    hasResults && testLinkCapacityMbps != null ? testLinkCapacityMbps : info ? getLinkCapacityMbps(info) : null
  // Still lays out the full grid with placeholders, so empty and filled match.
  const isEmpty = !hasResults && !isTesting
  const hasFooterInfo = connection != null || linkCapacityMbps != null

  const measuredPing =
    internetSpeed && isMeasuredLatency(internetSpeed.latencyMs) ? formatLatencyMs(internetSpeed.latencyMs) : null
  const measuredJitter =
    internetSpeed && isMeasuredLatency(internetSpeed.jitterMs) ? formatLatencyMs(internetSpeed.jitterMs) : null
  const measuredLoss = internetSpeed ? `${internetSpeed.packetLoss}%` : null

  return (
    <Card>
      <CardHeader
        title="Speed test"
        icon={<SpeedIcon size={15} />}
        actions={isEmpty && canTest ? <span className="type-caption text-tertiary">No tests yet</span> : undefined}
      />
      <CardBody>
        {error && (
          <p className="type-body-default inline-error" role="alert">
            {error}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-16">
          <HeroCell label="Download" series="down" mbps={downloadMbps} isPlaceholder={isEmpty} />
          <HeroCell label="Upload" series="up" mbps={uploadMbps} isPlaceholder={isEmpty} />
        </dl>

        {!isTesting && (
          <dl className="mt-16 grid grid-cols-3 gap-16">
            <Substat label="Ping" value={substatValue(measuredPing, isEmpty)} isEmpty={isEmpty} />
            <Substat label="Jitter" value={substatValue(measuredJitter, isEmpty)} isEmpty={isEmpty} />
            <Substat label="Loss" value={substatValue(measuredLoss, isEmpty)} isEmpty={isEmpty} />
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
