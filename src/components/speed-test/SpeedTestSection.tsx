import { memo, useEffect, useRef, useState } from 'react'
import type { SpeedResult, SpeedTestProgress } from '@/types'
import { formatLatencyMs, formatSpeedMbps, splitSpeedMbps } from '@/lib/format'
import Section from '@/components/ui/Section'
import { InlineMeta } from '@/components/ui/DotSeparator'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { useCountUp } from '@/hooks/useCountUp'
import { EthernetIcon, SpeedIcon, WifiIcon } from '@/components/ui/Icons'
import './SpeedTestSection.css'

export interface SpeedTestConnection {
  readonly type: 'wifi' | 'ethernet'
  readonly name: string | null
  readonly band: string | null
}

interface SpeedTestSectionProps {
  readonly internetSpeed: SpeedResult | null
  readonly linkCapacityMbps: number | null
  readonly connection: SpeedTestConnection | null
  readonly testing: boolean
  readonly canTest: boolean
  readonly error: string | null
  readonly progress: SpeedTestProgress
  /** Live (running-peak) throughput to show in the cells while a test runs. */
  readonly liveDownloadMbps: number
  readonly liveUploadMbps: number
}

function ConnectionTag({ connection }: { readonly connection: SpeedTestConnection }): JSX.Element {
  const name = connection.name ?? (connection.type === 'wifi' ? 'Wi‑Fi' : 'Ethernet')
  return (
    <span className={`bench-conn conn-${connection.type}`}>
      {connection.type === 'wifi' ? <WifiIcon size={12} /> : <EthernetIcon size={12} />}
      <InlineMeta items={[name, connection.band]} />
    </span>
  )
}

function SpeedCell({
  mbps,
  placeholder = false,
}: {
  readonly mbps: number | null
  readonly placeholder?: boolean
}): JSX.Element {
  const animated = useCountUp(mbps ?? 0)
  const { value, unit } = splitSpeedMbps(animated)

  return (
    <div className={`metric num${placeholder ? ' is-empty' : ''}`}>
      <span className="metric-value">{placeholder ? '…' : value}</span>
      {!placeholder && <span className="metric-unit">{unit}</span>}
    </div>
  )
}

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
const TRACK_GAP = 4 // px gap between the active tip and the track (Android LinearIndicatorTrackGapSize = 4dp)
const LEAD_DOT_R = WAVE_STROKE + 2 // dot rides the leading edge of the wave

// Full amplitude throughout — the wave stays wavy from the start right up to the
// rounded cap at the leading edge, like Android's.
function waveY(x: number, phase: number): number {
  return WAVE_MID + WAVE_AMPLITUDE * Math.sin(((x + phase) / WAVE_LENGTH) * Math.PI * 2)
}

// The backend reports progress in coarse steps (mirror them here). Rather than
// snap between them, the fill creeps steadily toward *just short of* the next
// step during a phase, and eases up to catch the backend if it jumps ahead — so
// the bar always advances smoothly instead of stepping.
const PROGRESS_STEPS = [0, 15, 55, 85, 100]
const PROGRESS_CREEP = 0.12 // % per frame steady creep
const PROGRESS_MARGIN = 4 // stop this far short of the next step until it's confirmed

function nextStepCeiling(backend: number): number {
  for (const step of PROGRESS_STEPS) {
    if (step > backend + 0.5) return step
  }
  return 100
}

function WavyProgress({ progress }: { readonly progress: number }): JSX.Element {
  const target = Math.max(0, Math.min(100, progress))
  const targetRef = useRef(target)
  targetRef.current = target
  const pctRef = useRef(target)
  const phaseRef = useRef(0)
  const [, setFrame] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = (): void => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // One rAF loop drives both: the fill eases toward the latest percentage (so it
  // grows smoothly between the backend's discrete steps) and the wave phase
  // scrolls at a constant, time-based velocity (so the flow never speeds up or
  // slows down with the frame rate).
  useEffect(() => {
    let raf = 0
    const loop = (time: number): void => {
      const backend = targetRef.current
      const ceiling = backend >= 100 ? 100 : nextStepCeiling(backend) - PROGRESS_MARGIN
      let next = Math.min(pctRef.current + PROGRESS_CREEP, ceiling)
      if (backend > next) next += (backend - next) * 0.2 // ease up to a backend jump
      pctRef.current = Math.max(pctRef.current, next) // monotonic
      phaseRef.current = -(((time / 1000) * WAVE_SPEED) % WAVE_LENGTH)
      setFrame((n) => (n + 1) % 1_000_000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const phase = phaseRef.current
  const fraction = Math.max(pctRef.current / 100, WAVE_MIN_FRACTION)
  const end = fraction * width
  const dotY = WAVE_MID // dot stays steady on the centerline while the wave undulates behind it
  // Track runs to just inside the right edge so its round cap doesn't clip.
  const trackEnd = width - WAVE_STROKE / 2
  // Track starts a gap past the active tip and runs to the end.
  const trackStart = Math.min(end + LEAD_DOT_R + TRACK_GAP, trackEnd)
  const showTrack = trackEnd - trackStart > 0.5

  // Smooth (quadratic through midpoints) squiggle from 0 to the leading edge.
  // The wave carries full amplitude all the way, ending on the rounded cap
  // wherever the wave happens to be — like Android's.
  let active = ''
  if (width > 0) {
    let prevX = 0
    let prevY = waveY(0, phase)
    active = `M ${prevX.toFixed(2)} ${prevY.toFixed(2)}`
    for (let x = 3; x <= end; x += 3) {
      const y = waveY(x, phase)
      active += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${((prevX + x) / 2).toFixed(2)} ${((prevY + y) / 2).toFixed(2)}`
      prevX = x
      prevY = y
    }
    active += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${end.toFixed(2)} ${waveY(end, phase).toFixed(2)}`
  }

  return (
    <div ref={wrapRef} className="wavy-progress" aria-hidden>
      {width > 0 && (
        <svg width={width} height={WAVE_HEIGHT} viewBox={`0 0 ${width} ${WAVE_HEIGHT}`}>
          {showTrack && (
            <line
              className="wavy-track"
              x1={trackStart}
              y1={WAVE_MID}
              x2={trackEnd}
              y2={WAVE_MID}
            />
          )}
          <path className="wavy-fill" d={active} />
          <circle className="wavy-dot" cx={end} cy={dotY} r={LEAD_DOT_R} />
        </svg>
      )}
    </div>
  )
}

function TestProgress({ progress }: { readonly progress: SpeedTestProgress }): JSX.Element {
  return (
    <div className="bench-progress">
      <div className="bench-progress-head">
        <span className="bench-progress-message">{progress.message || 'Starting…'}</span>
        <span className="bench-progress-pct num">{Math.round(progress.progress)}%</span>
      </div>
      <div
        className="bench-progress-track"
        role="progressbar"
        aria-valuenow={progress.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={progress.message}
      >
        <WavyProgress progress={progress.progress} />
      </div>
    </div>
  )
}

function SpeedTestSection({
  internetSpeed,
  linkCapacityMbps,
  connection,
  testing,
  canTest,
  error,
  progress,
  liveDownloadMbps,
  liveUploadMbps,
}: SpeedTestSectionProps): JSX.Element {
  const hasResults = internetSpeed != null
  // Empty state: connected and idle, but no test has run yet. We still lay out
  // the full metric grid with placeholder values so the empty and filled states
  // share the same structure.
  const isEmpty = !hasResults && !testing
  // While testing, show live (peak) throughput once a direction's phase has begun
  // (download at 15%, upload at 55%); otherwise show 0 so unset cells read as zero.
  const downloadCell = testing
    ? progress.progress >= 15
      ? liveDownloadMbps
      : 0
    : (internetSpeed?.downloadMbps ?? null)
  const uploadCell = testing
    ? progress.progress >= 55
      ? liveUploadMbps
      : 0
    : (internetSpeed?.uploadMbps ?? null)
  const pingText =
    internetSpeed && Number.isFinite(internetSpeed.latencyMs) && internetSpeed.latencyMs < 999
      ? formatLatencyMs(internetSpeed.latencyMs)
      : isEmpty
        ? '…'
        : '—'
  const jitterText =
    internetSpeed && Number.isFinite(internetSpeed.jitterMs) && internetSpeed.jitterMs < 999
      ? formatLatencyMs(internetSpeed.jitterMs)
      : isEmpty
        ? '…'
        : '—'
  const lossText = internetSpeed ? `${internetSpeed.packetLoss}%` : isEmpty ? '…' : '—'

  return (
    <Section
      title="Speed test"
      icon={<SpeedIcon size={15} />}
      action={isEmpty && canTest ? <span className="text-meta">No tests yet</span> : undefined}
    >
      {error && <p className="inline-error">{error}</p>}

      {!canTest && !testing ? (
        <div className="section-placeholder">
          <SpeedIcon size={24} className="section-placeholder-icon" />
          <p className="text-hint">Connect to Wi‑Fi or Ethernet to run a speed test.</p>
        </div>
      ) : (
        <>
          <div className="bench-hero">
            <div className="bench-hero-cell">
              <div className="bench-hero-label">
                <DirectionIcon series="down" />
                <span className="field-label">Download</span>
              </div>
              <SpeedCell mbps={downloadCell} placeholder={isEmpty} />
            </div>
            <div className="bench-hero-cell">
              <div className="bench-hero-label">
                <DirectionIcon series="up" />
                <span className="field-label">Upload</span>
              </div>
              <SpeedCell mbps={uploadCell} placeholder={isEmpty} />
            </div>
          </div>

          {!testing && (
            <div className="bench-substats">
              <div className="bench-substat">
                <span className="field-label">Ping</span>
                <span className={`bench-substat-value num${isEmpty ? ' is-empty' : ''}`}>
                  {pingText}
                </span>
              </div>
              <div className="bench-substat">
                <span className="field-label">Jitter</span>
                <span className={`bench-substat-value num${isEmpty ? ' is-empty' : ''}`}>
                  {jitterText}
                </span>
              </div>
              <div className="bench-substat">
                <span className="field-label">Loss</span>
                <span className={`bench-substat-value num${isEmpty ? ' is-empty' : ''}`}>
                  {lossText}
                </span>
              </div>
            </div>
          )}

          {testing ? (
            <TestProgress progress={progress} />
          ) : (
            hasResults &&
            (connection != null || linkCapacityMbps != null) && (
              <div className="bench-footer">
                <p className="text-meta bench-footnote">
                  {connection != null && <ConnectionTag connection={connection} />}
                  {linkCapacityMbps != null && (
                    <span className="bench-footnote-link">
                      Link speed <span className="num">{formatSpeedMbps(linkCapacityMbps)}</span>
                    </span>
                  )}
                </p>
              </div>
            )
          )}
        </>
      )}
    </Section>
  )
}

export default memo(SpeedTestSection)
