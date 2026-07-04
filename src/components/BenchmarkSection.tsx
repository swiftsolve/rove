import { memo } from 'react'
import type { SpeedResult, SpeedTestProgress } from '@shared/types'
import { formatLatencyMs, formatSpeedMbps, isDisplayableMbps, splitSpeedMbps } from '../utils/format'
import Section from './ui/Section'
import { HistoryIcon, PlayIcon, RefreshIcon, SpeedIcon, StopIcon } from './Icons'
import './BenchmarkSection.css'

interface BenchmarkSectionProps {
  readonly internetSpeed: SpeedResult | null
  readonly linkCapacityMbps: number | null
  readonly testing: boolean
  readonly canTest: boolean
  readonly error: string | null
  readonly progress: SpeedTestProgress
  readonly onRunTest: () => void
  readonly onCancelTest: () => void
  readonly onOpenHistory: () => void
}

function SpeedCell({ mbps }: { readonly mbps: number | null | undefined }): JSX.Element {
  if (!isDisplayableMbps(mbps)) {
    return <span className="text-muted num bench-empty">—</span>
  }

  const { value, unit } = splitSpeedMbps(mbps)

  return (
    <div className="metric num">
      <span className="metric-value">{value}</span>
      <span className="metric-unit">{unit}</span>
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
        <div className="bench-progress-fill" style={{ width: `${progress.progress}%` }} />
      </div>
    </div>
  )
}

function BenchmarkSection({
  internetSpeed,
  linkCapacityMbps,
  testing,
  canTest,
  error,
  progress,
  onRunTest,
  onCancelTest,
  onOpenHistory,
}: BenchmarkSectionProps): JSX.Element {
  const hasResults = internetSpeed != null
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
          <button
            type="button"
            className="btn-icon btn-icon-secondary"
            onClick={onOpenHistory}
            title="History"
            aria-label="Speed test history"
          >
            <HistoryIcon size={15} />
          </button>
          {testing ? (
            <button
              type="button"
              className="btn-icon btn-icon-stop"
              onClick={onCancelTest}
              title="Stop test"
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
              title={!canTest ? 'Connect to a network first' : hasResults ? 'Test again' : 'Run test'}
              aria-label={hasResults ? 'Test again' : 'Run test'}
            >
              {hasResults ? <RefreshIcon size={16} /> : <PlayIcon size={16} />}
            </button>
          )}
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
              <SpeedCell mbps={internetSpeed?.downloadMbps} />
            </div>
            <div className="bench-hero-cell">
              <span className="field-label">Upload</span>
              <SpeedCell mbps={internetSpeed?.uploadMbps} />
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
            linkCapacityMbps != null && (
              <p className="text-meta bench-footnote">
                Adapter link speed · <span className="num">{formatSpeedMbps(linkCapacityMbps)}</span>
              </p>
            )
          )}
        </>
      )}
    </Section>
  )
}

export default memo(BenchmarkSection)
