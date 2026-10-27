import { memo, useEffect, useId, useRef, type CSSProperties } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { NetworkInfo, SpeedResult, SpeedTestProgress } from '@/types'
import { FAILED_PING, getLinkCapacityMbps, isWifiNetwork } from '@/types'
import { formatBand, formatLatencyMs, formatSpeedMbps, splitSpeedMbps } from '@/lib/format'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { Section } from '@/components/Section'
import { InlineMeta } from '@/components/DotSeparator'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import { useCountUp } from '@/hooks/useCountUp'
import { useLatestRef } from '@/hooks/useLatestRef'
import { EthernetIcon, SpeedIcon, WifiIcon } from '@/components/icons/Icons'
import type { SpeedSeries } from '@/components/icons/DirectionIcon'
import type { SpeedTestConnection } from '@/features/speed/types'

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
  '-mx-(--section-body-padding) mt-16 -mb-(--section-body-padding)',
  'bg-inset p-(--section-body-padding)',
)

// Material 3 "wavy" determinate progress, matching Android's LinearWavyProgressIndicator:
// a scrolling squiggle for the active portion with a dot riding its leading edge,
// a small gap, then a flat track for the remaining portion. Drawn in real
// pixels (the container width is measured) so it maps 1:1 — no aspect distortion,
// which keeps the wave's wavelength honest and the caps perfectly round. All
// dimensions below are in px, mirroring the Android dp defaults.
const WAVE_HEIGHT = 16
const WAVE_MID = WAVE_HEIGHT / 2
const WAVE_AMPLITUDE = 2.5
const WAVE_LENGTH = 40 // px per wave (Android LinearDeterminateWavelength = 40dp)
const WAVE_STROKE = 3 // active + track thickness
const WAVE_SPEED = 40 // px/second — Android moves the wave one wavelength per second
const WAVE_MIN_FRACTION = 0.03 // draw a small sliver even at 0% so the bar reads as live
const WAVE_SAMPLE_STEP = 3 // px between the points the squiggle path is built through
const TRACK_GAP = 4 // px gap between the active tip and the track (Android LinearIndicatorTrackGapSize = 4dp)
const LEAD_DOT_R = WAVE_STROKE + 2 // dot rides the leading edge of the wave
const MIN_REDRAW_PX = 0.25 // skip DOM writes for moves smaller than this
const MIN_TRACK_PX = 0.5 // hide the track once less than this is left of it

// The backend reports progress in coarse steps (mirror them here). Rather than
// snap between them, the fill creeps steadily toward *just short of* the next
// step during a phase, and eases up to catch the backend if it jumps ahead — so
// the bar always advances smoothly instead of stepping.
const DOWNLOAD_PHASE_START_PCT = 15
const UPLOAD_PHASE_START_PCT = 55
const PROGRESS_STEPS = [0, DOWNLOAD_PHASE_START_PCT, UPLOAD_PHASE_START_PCT, 85, 100]
const PROGRESS_CREEP = 0.12 // % per frame steady creep
const PROGRESS_MARGIN = 4 // stop this far short of the next step until it's confirmed
const STEP_REACHED_TOLERANCE = 0.5 // % within which the backend counts as at a step
const CATCH_UP_EASE = 0.2 // fraction of the gap closed per frame when the backend jumps ahead

// The smoothed fill leads the backend's coarse steps, so it must outlive the
// component: switching tabs mid-test and coming back should resume the bar
// where it had crept to, not snap back to the last backend step. Kept at module
// scope (like the store's live-peak throughput) so it survives remounts; a new
// run rewinds the backend to 0, which is our cue to clear the carried-over fill.
let persistedFillPct = 0

// Full amplitude throughout — the wave stays wavy from the start right up to the
// rounded cap at the leading edge, like Android's.
function waveY(x: number, phase: number): number {
  return WAVE_MID + WAVE_AMPLITUDE * Math.sin(((x + phase) / WAVE_LENGTH) * Math.PI * 2)
}

// Build the squiggle path ONCE per width: a smooth (quadratic through midpoints)
// wave spanning one wavelength of overscan on the left (so the CSS scroll can
// translate it rightward without exposing a gap) through the full width. Phase
// is fixed at 0 — the scroll is a CSS transform on the GPU, not a per-frame
// rebuild, so this string is only regenerated when the container resizes.
function buildStaticWave(width: number): string {
  const start = -WAVE_LENGTH
  let prevX = start
  let prevY = waveY(start, 0)
  let path = `M ${prevX.toFixed(2)} ${prevY.toFixed(2)}`
  for (let x = start + WAVE_SAMPLE_STEP; x <= width; x += WAVE_SAMPLE_STEP) {
    const y = waveY(x, 0)
    path += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${((prevX + x) / 2).toFixed(2)} ${((prevY + y) / 2).toFixed(2)}`
    prevX = x
    prevY = y
  }
  path += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${width.toFixed(2)} ${waveY(width, 0).toFixed(2)}`
  return path
}

function nextStepCeiling(backendPct: number): number {
  for (const step of PROGRESS_STEPS) {
    if (step > backendPct + STEP_REACHED_TOLERANCE) return step
  }
  return 100
}

/** One frame of the smoothed fill: creep toward the next step, catch up to a
 *  backend jump, and never move backwards. */
function advanceFill(fillPct: number, backendPct: number): number {
  const ceiling = backendPct >= 100 ? 100 : nextStepCeiling(backendPct) - PROGRESS_MARGIN
  let next = Math.min(fillPct + PROGRESS_CREEP, ceiling)
  if (backendPct > next) next += (backendPct - next) * CATCH_UP_EASE
  return Math.max(fillPct, next)
}

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

/** What the live region announces: the current phase while a test runs, the
 *  headline result once one completes, and nothing after a stop or failure (a
 *  failure has its own alert). */
function testStatusText(
  isTesting: boolean,
  progress: SpeedTestProgress,
  result: SpeedResult | null,
): string {
  if (isTesting) return progress.message || 'Starting…'
  if (progress.phase !== 'complete' || result == null) return ''
  return `Speed test complete. Download ${formatSpeedMbps(result.downloadMbps)}, upload ${formatSpeedMbps(result.uploadMbps)}.`
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

function WavyProgress({ progress }: { progress: number }): JSX.Element {
  const targetPct = Math.max(0, Math.min(100, progress))
  const targetRef = useLatestRef(targetPct)

  // Sanitize the colons React's useId emits — they're fine in most contexts but
  // brittle inside an SVG url(#…) fragment reference.
  const clipId = `wavy${useId().replace(/:/g, '')}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fillRef = useRef<SVGPathElement>(null)
  const clipRef = useRef<SVGRectElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const trackRef = useRef<SVGLineElement>(null)

  // The wave *shape* is fixed; only its horizontal offset scrolls, and that's a
  // CSS transform on the scroll group (compositor-driven — see `animate-wavy-scroll`
  // in styles/tailwind.css).
  // So the expensive work — building the squiggle `d` string and re-parsing it —
  // happens only when the width changes, here, not 60×/s. The per-frame loop
  // below is left with a couple of trivial attribute writes.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let width = wrap.clientWidth
    const applySize = (): void => {
      const svg = svgRef.current
      const fill = fillRef.current
      if (svg && fill && width > 0) {
        svg.setAttribute('width', String(width))
        svg.setAttribute('viewBox', `0 0 ${width} ${WAVE_HEIGHT}`)
        fill.setAttribute('d', buildStaticWave(width)) // rebuilt only on resize
      }
    }
    const measure = (): void => {
      width = wrap.clientWidth
      applySize()
    }
    applySize()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)

    // Per-frame work is just advancing the fill length: a clip rect grows to
    // reveal more of the (already-drawn, GPU-scrolled) wave, and the dot rides
    // its leading edge. No geometry is rebuilt, so the loop is nearly free.
    let fillPct = persistedFillPct
    let lastFillEnd = -1
    let lastTrackStart = -1
    let frameId = 0

    const drawFill = (clip: SVGRectElement, dot: SVGCircleElement, track: SVGLineElement): void => {
      const fillEnd = Math.max(fillPct / 100, WAVE_MIN_FRACTION) * width
      // Skip the DOM writes on frames where the fill hasn't moved a pixel — the
      // creep is sub-pixel per frame, so most frames are no-ops.
      if (Math.abs(fillEnd - lastFillEnd) < MIN_REDRAW_PX) return
      lastFillEnd = fillEnd
      clip.setAttribute('width', fillEnd.toFixed(2))
      dot.setAttribute('cx', fillEnd.toFixed(2))

      // Track runs to just inside the right edge (round cap unclipped),
      // starting a gap past the active tip.
      const trackEnd = width - WAVE_STROKE / 2
      const trackStart = Math.min(fillEnd + LEAD_DOT_R + TRACK_GAP, trackEnd)
      if (Math.abs(trackStart - lastTrackStart) < MIN_REDRAW_PX) return
      lastTrackStart = trackStart
      if (trackEnd - trackStart > MIN_TRACK_PX) {
        track.setAttribute('x1', trackStart.toFixed(2))
        track.setAttribute('x2', trackEnd.toFixed(2))
        track.style.display = ''
      } else {
        track.style.display = 'none'
      }
    }

    const loop = (): void => {
      const backendPct = targetRef.current
      // A new run rewinds the backend to 0 — mirror that in the local fill so the
      // bar restarts instead of holding a stale value carried over the remount.
      if (backendPct === 0) fillPct = 0
      fillPct = advanceFill(fillPct, backendPct)
      persistedFillPct = fillPct // survive a remount mid-test

      const clip = clipRef.current
      const dot = dotRef.current
      const track = trackRef.current
      if (width > 0 && clip && dot && track) drawFill(clip, dot, track)
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [targetRef])

  // Static shell. The wave is drawn once and scrolls via CSS; a clip rect (grown
  // by the loop) reveals the filled portion; the dot rides its leading edge and
  // masks the clip's straight cut. The dot stays on the centerline, so cy is fixed.
  return (
    <div ref={wrapRef} className="block h-16 w-full leading-[0]" aria-hidden>
      <svg ref={svgRef} height={WAVE_HEIGHT}>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect ref={clipRef} x={0} y={0} width={0} height={WAVE_HEIGHT} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <g
            className="animate-wavy-scroll will-change-transform motion-reduce:animate-none"
            style={
              {
                '--wave-length': `${WAVE_LENGTH}px`,
                animationDuration: `${WAVE_LENGTH / WAVE_SPEED}s`,
              } as CSSProperties
            }
          >
            <path
              ref={fillRef}
              className="fill-none stroke-accent stroke-3 [stroke-linecap:round] [stroke-linejoin:round]"
            />
          </g>
        </g>
        {/* The remaining portion: the same accent, dimmed, as Android draws the
            track at reduced emphasis behind the active indicator. */}
        <line
          ref={trackRef}
          className="stroke-accent stroke-3 opacity-24 [stroke-linecap:round]"
          y1={WAVE_MID}
          y2={WAVE_MID}
          style={{ display: 'none' }}
        />
        <circle ref={dotRef} className="fill-accent" cy={WAVE_MID} r={LEAD_DOT_R} />
      </svg>
    </div>
  )
}

function TestProgress({ progress }: { progress: SpeedTestProgress }): JSX.Element {
  return (
    <div className={cx(INSET_PANEL, 'flex flex-col gap-8')}>
      <div className="flex items-baseline justify-between gap-12">
        <span className="text-sm leading-small text-secondary">{progress.message || 'Starting…'}</span>
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
        <WavyProgress progress={progress.progress} />
      </div>
    </div>
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
        <span className="field-label">{label}</span>
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
      <dt className="field-label">{label}</dt>
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
    // size comes from .text-meta.
    <div className={cx(INSET_PANEL, 'flex items-center')}>
      <p className="text-meta flex w-full min-w-0 items-center justify-between gap-12">
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

export const SpeedTestSection = memo(function SpeedTestSection(): JSX.Element {
  const { info } = useNetwork()
  const {
    internetSpeed,
    isTesting,
    progress,
    error,
    linkCapacityMbps: testLinkCapacityMbps,
    runConnection,
    // Live (running-peak) throughput to show in the cells while a test runs.
    livePeakDownloadMbps: liveDownloadMbps,
    livePeakUploadMbps: liveUploadMbps,
  } = useSpeedTest()
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

  const downloadMbps = heroCellMbps(
    isTesting,
    progress.progress,
    DOWNLOAD_PHASE_START_PCT,
    liveDownloadMbps,
    internetSpeed?.downloadMbps,
  )
  const uploadMbps = heroCellMbps(
    isTesting,
    progress.progress,
    UPLOAD_PHASE_START_PCT,
    liveUploadMbps,
    internetSpeed?.uploadMbps,
  )

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
    <Section
      title="Speed test"
      icon={<SpeedIcon size={15} />}
      action={isEmpty && canTest ? <span className="text-meta">No tests yet</span> : undefined}
    >
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

      {isTesting && <TestProgress progress={progress} />}
      {!isTesting && hasResults && hasFooterInfo && (
        <ResultFooter connection={connection} linkCapacityMbps={linkCapacityMbps} />
      )}

      {/* Always mounted so screen readers hear each phase and the result as they
          land; the visible readouts count up every frame, so they can't be live. */}
      <p className="sr-only" role="status">
        {testStatusText(isTesting, progress, internetSpeed)}
      </p>
    </Section>
  )
})
