import { memo, useEffect, useRef, useState } from 'react'
import type { SpeedResult, SpeedTestProgress } from '@/types'
import { formatLatencyMs, formatSpeedMbps, splitSpeedMbps } from '@/lib/format'
import Section from '@/components/ui/Section'
import { Tooltip } from '@/components/ui/Tooltip'
import { useCountUp } from '@/hooks/useCountUp'
import {
  EthernetIcon,
  PlayIcon,
  RefreshIcon,
  SpeedIcon,
  StopIcon,
  WifiIcon,
} from '@/components/ui/Icons'
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
  readonly onRunTest: () => void
  readonly onCancelTest: () => void
}

function ConnectionTag({ connection }: { readonly connection: SpeedTestConnection }): JSX.Element {
  const name = connection.name ?? (connection.type === 'wifi' ? 'Wi‑Fi' : 'Ethernet')
  const label = connection.band ? `${name} · ${connection.band}` : name
  return (
    <span className={`bench-conn conn-${connection.type}`}>
      {connection.type === 'wifi' ? <WifiIcon size={12} /> : <EthernetIcon size={12} />}
      {label}
    </span>
  )
}

function SpeedCell({ mbps }: { readonly mbps: number | null }): JSX.Element {
  const animated = useCountUp(mbps ?? 0)
  const { value, unit } = splitSpeedMbps(animated)

  return (
    <div className="metric num">
      <span className="metric-value">{value}</span>
      <span className="metric-unit">{unit}</span>
    </div>
  )
}

// Material-style "wavy" progress: a scrolling squiggle with a dot at its leading
// edge. Drawn in real pixels (the container width is measured) so it maps 1:1 —
// no aspect distortion, which keeps the wave's wavelength honest and the end dot
// perfectly round. All dimensions below are in px.
const WAVE_HEIGHT = 16
const WAVE_MID = WAVE_HEIGHT / 2
const WAVE_AMPLITUDE = 2
const WAVE_LENGTH = 42 // px per wave
const WAVE_STROKE = 2.5
const WAVE_SPEED = 46 // px/second the squiggle scrolls (time-based → constant)
const WAVE_TAPER = 18 // px over which the amplitude ramps in/out at each end
const WAVE_MIN_FRACTION = 0.12 // always draw at least this fraction, so 0% still waves

// Amplitude envelope: flat (0) at both ends, full in the middle — so the line
// runs straight into the start and into the leading dot, like Android's.
function amplitudeAt(x: number, end: number): number {
  const ramp = Math.min(x / WAVE_TAPER, (end - x) / WAVE_TAPER, 1)
  return WAVE_AMPLITUDE * Math.max(0, ramp)
}

function waveY(x: number, phase: number, end: number): number {
  return WAVE_MID + amplitudeAt(x, end) * Math.sin(((x + phase) / WAVE_LENGTH) * Math.PI * 2)
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

  // Smooth (quadratic through midpoints) squiggle from 0 to the leading edge.
  // The amplitude envelope flattens the line at both ends.
  let active = ''
  const dotY = WAVE_MID // amplitude tapers to 0 at `end`, so the dot sits on the midline
  if (width > 0) {
    let prevX = 0
    let prevY = waveY(0, phase, end)
    active = `M ${prevX.toFixed(2)} ${prevY.toFixed(2)}`
    for (let x = 3; x <= end; x += 3) {
      const y = waveY(x, phase, end)
      active += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${((prevX + x) / 2).toFixed(2)} ${((prevY + y) / 2).toFixed(2)}`
      prevX = x
      prevY = y
    }
    active += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${end.toFixed(2)} ${WAVE_MID.toFixed(2)}`
  }

  return (
    <div ref={wrapRef} className="wavy-progress" aria-hidden>
      {width > 0 && (
        <svg width={width} height={WAVE_HEIGHT} viewBox={`0 0 ${width} ${WAVE_HEIGHT}`}>
          <path className="wavy-fill" d={active} />
          <circle className="wavy-dot" cx={end} cy={dotY} r={WAVE_STROKE} />
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
  onRunTest,
  onCancelTest,
}: SpeedTestSectionProps): JSX.Element {
  const hasResults = internetSpeed != null
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
      : '—'
  const jitterText =
    internetSpeed && Number.isFinite(internetSpeed.jitterMs) && internetSpeed.jitterMs < 999
      ? formatLatencyMs(internetSpeed.jitterMs)
      : '—'
  const lossText = internetSpeed ? `${internetSpeed.packetLoss}%` : '—'

  return (
    <Section
      title="Speed test"
      icon={<SpeedIcon size={15} />}
      action={
        <div className="bench-actions">
          <Tooltip
            content={
              testing
                ? 'Stop test'
                : !canTest
                  ? 'Connect to a network first'
                  : hasResults
                    ? 'Test again'
                    : 'Run test'
            }
          >
            {testing ? (
              <button
                type="button"
                className="btn-icon btn-icon-stop"
                onClick={onCancelTest}
                aria-label="Stop test"
              >
                <StopIcon size={13} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-icon btn-icon-primary"
                onClick={onRunTest}
                disabled={!canTest}
                aria-label={hasResults ? 'Test again' : 'Run test'}
              >
                {hasResults ? <RefreshIcon size={16} /> : <PlayIcon size={16} />}
              </button>
            )}
          </Tooltip>
        </div>
      }
    >
      {error && <p className="inline-error">{error}</p>}

      {!canTest && !testing && (
        <div className="section-placeholder">
          <SpeedIcon size={24} className="section-placeholder-icon" />
          <p className="text-hint">Connect to Wi‑Fi or Ethernet to run a speed test.</p>
        </div>
      )}

      {!hasResults && !testing && canTest && (
        <div className="section-placeholder">
          <SpeedIcon size={24} className="section-placeholder-icon" />
          <p className="text-hint">Measure your real download and upload speeds to the internet.</p>
        </div>
      )}

      {(hasResults || testing) && (
        <>
          <div className="bench-hero">
            <div className="bench-hero-cell">
              <span className="field-label">Download</span>
              <SpeedCell mbps={downloadCell} />
            </div>
            <div className="bench-hero-cell">
              <span className="field-label">Upload</span>
              <SpeedCell mbps={uploadCell} />
            </div>
          </div>

          {hasResults && !testing && (
            <div className="bench-substats">
              <div className="bench-substat">
                <span className="field-label">Ping</span>
                <span className="bench-substat-value num">{pingText}</span>
              </div>
              <div className="bench-substat">
                <span className="field-label">Jitter</span>
                <span className="bench-substat-value num">{jitterText}</span>
              </div>
              <div className="bench-substat">
                <span className="field-label">Loss</span>
                <span className="bench-substat-value num">{lossText}</span>
              </div>
            </div>
          )}

          {testing ? (
            <TestProgress progress={progress} />
          ) : (
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
