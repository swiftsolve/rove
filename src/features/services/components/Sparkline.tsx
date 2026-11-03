import { cva, cx } from 'class-variance-authority'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import type { LatencySample } from '@/features/services/utils/service-latency'
import { type LatencyBand, latencyBand } from '@/features/services/utils/service-status'
import { formatCount, formatLatencyMs } from '@/lib/format'
import { NoValue } from '@/ui'

const ROOT = 'inline-block shrink-0'

const chartVariants = cva('cursor-crosshair overflow-visible', {
  variants: {
    /** The health band, which colours the line via currentColor. */
    status: {
      none: 'text-tertiary',
      positive: 'text-status-positive',
      warning: 'text-status-warning',
      negative: 'text-status-negative',
    },
    /** Nothing recorded yet: an empty box that holds the row's space, so rows
     *  don't reflow once history starts to land. */
    isEmpty: { true: 'inline-block', false: 'block' },
  },
  defaultVariants: { status: 'none', isEmpty: false },
})

const lineVariants = cva('fill-none stroke-current stroke-[1.25] opacity-85 [stroke-linejoin:round]', {
  variants: {
    /** The down state's flat line: square ends, so it sits flush with the text under it. */
    isFlat: { true: '[stroke-linecap:butt]', false: '[stroke-linecap:round]' },
  },
  defaultVariants: { isFlat: false },
})

// Centred over the hovered point and lifted above the chart.
const TIP = cx(
  'pointer-events-none fixed z-9999 -translate-x-1/2 -translate-y-full whitespace-nowrap',
  'rounded-xs border border-line bg-surface px-6 py-2 shadow-panel',
  'font-numeric text-2xs leading-[1.2] text-primary tabular-nums',
)

// The hovered point, and the chart's top-left corner in the window when it was hovered.
type Hover = {
  index: number
  left: number
  top: number
}

type Point = {
  x: number
  y: number
  sample: LatencySample
}

type SparklineProps = {
  /** Recent latency readings, oldest first. */
  samples: LatencySample[]
  width?: number
  height?: number
  /** What the chart is about, e.g. the service name; leads its spoken summary. */
  label?: string
  /** How many samples the x-axis spans. Set to the history window, a partial
   *  history fills in from the left with the newest sample at the right edge,
   *  instead of stretching. Defaults to the sample count. */
  slots?: number
  /** Draw a flat red baseline instead of the trend, so an outage never reads as healthy. */
  isDown?: boolean
}

// Keeps the stroke and dots off the top and bottom edges. No horizontal inset:
// the line runs edge to edge to align with the text around it, and the svg
// doesn't clip, so caps and dots may overhang slightly.
const VERTICAL_PAD = 3

const DOT_RADIUS = 1.5
const CURSOR_DOT_RADIUS = 2.5

/** Health band for a latency, matching the numeric readout's colour thresholds. */
function chartStatus(ms: number | null): LatencyBand {
  if (ms === null) return 'negative'
  return latencyBand(ms)
}

function toSvgPoints(run: Point[]): string {
  return run.map((p) => `${p.x},${p.y}`).join(' ')
}

function placePoints(samples: LatencySample[], width: number, height: number, slots: number | undefined): Point[] {
  const sampleCount = samples.length
  const innerHeight = height - VERTICAL_PAD * 2
  const span = Math.max(slots ?? sampleCount, sampleCount)

  // Scaled over the observed range, so small swings still show.
  const values = samples.map((s) => s.ms).filter((ms): ms is number => ms !== null)
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 1
  const isFlat = max === min

  // Right-aligned, leaving the unfilled part of the window blank.
  const xAt = (i: number): number => (span <= 1 ? width : ((span - sampleCount + i) / (span - 1)) * width)
  // Identical values have no range to scale over, so they sit on the midline.
  const yAt = (ms: number): number =>
    isFlat ? VERTICAL_PAD + innerHeight / 2 : VERTICAL_PAD + innerHeight - ((ms - min) / (max - min)) * innerHeight

  return samples.map((sample, i) => ({
    x: xAt(i),
    y: sample.ms === null ? height - VERTICAL_PAD : yAt(sample.ms),
    sample,
  }))
}

/** Consecutive reachable points: never empty. */
type Run = [Point, ...Point[]]

// A failed sample leaves a gap instead of a line diving to the baseline and back.
function splitIntoRuns(points: Point[]): Run[] {
  const runs: Run[] = []
  let run: Run | null = null
  for (const point of points) {
    if (point.sample.ms === null) {
      run = null
    } else if (run) {
      run.push(point)
    } else {
      run = [point]
      runs.push(run)
    }
  }
  return runs
}

function areaPoints(run: Run, baseline: number): string {
  const firstX = run[0].x
  const lastX = (run.at(-1) ?? run[0]).x
  return `${toSvgPoints(run)} ${lastX},${baseline} ${firstX},${baseline}`
}

/** The chart's spoken summary: how many checks it spans, their latency range and
 *  how many failed, e.g. "GitHub latency over the last 24 checks: 18.2 ms to 42.0 ms, 1 failed". */
function chartDescription(samples: LatencySample[], label: string | undefined): string {
  const subject = label ? `${label} latency` : 'Latency'
  const checks = formatCount(samples.length, 'check')
  const values = samples.map((s) => s.ms).filter((ms): ms is number => ms !== null)
  const failedCount = samples.length - values.length
  const facts: string[] = []
  if (values.length > 0) {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const [minText, maxText] = [formatLatencyMs(min) ?? 'unknown', formatLatencyMs(max) ?? 'unknown']
    facts.push(min === max ? minText : `${minText} to ${maxText}`)
  }
  if (failedCount > 0) facts.push(`${failedCount} failed`)
  return `${subject} over the last ${checks}: ${facts.join(', ')}`
}

function nearestPointIndex(points: Point[], x: number): number {
  let nearest = 0
  let bestDistance = Infinity
  points.forEach((point, i) => {
    const distance = Math.abs(point.x - x)
    if (distance < bestDistance) {
      bestDistance = distance
      nearest = i
    }
  })
  return nearest
}

/** Where the pointer is over the chart: its x within it, and the chart's corner in the window. */
function pointerOver(e: React.MouseEvent<SVGSVGElement>): { x: number; left: number; top: number } {
  const rect = e.currentTarget.getBoundingClientRect()
  return { x: e.clientX - rect.left, left: rect.left, top: rect.top }
}

/** The value bubble, portalled so the card the row sits in never clips it. */
function HoverTip({ hover, x, children }: { hover: Hover; x: number; children: ReactNode }) {
  return createPortal(
    <span className={TIP} style={{ left: hover.left + x, top: hover.top - 3 }} aria-hidden="true">
      {children}
    </span>,
    document.body,
  )
}

/**
 * A service row's recent handshake times, coloured by the latest reading's health
 * band. Failed probes break the line and leave a marker on the baseline; hovering
 * shows a point's value. A down service draws a flat red baseline instead.
 */
export function Sparkline({ samples, width = 76, height = 22, label, slots, isDown = false }: SparklineProps) {
  const [hover, setHover] = useState<Hover | null>(null)
  const isHovered = hover !== null
  // Per instance, so sparklines on one page don't share a gradient. Colons
  // aren't safe in a `url(#…)` reference.
  const fillId = useId().replace(/:/g, '')
  const baseline = height - VERTICAL_PAD

  const { points, runs } = useMemo(() => {
    const placed = placePoints(samples, width, height, slots)
    return { points: placed, runs: splitIntoRuns(placed) }
  }, [samples, width, height, slots])

  // The bubble is fixed in the window, so a scroll under a still pointer would
  // leave it behind: it hides until the pointer moves again.
  useEffect(() => {
    if (!isHovered) return
    const hide = (): void => setHover(null)
    window.addEventListener('scroll', hide, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', hide, { capture: true })
  }, [isHovered])

  // On the baseline, where failed probes sit, so it reads as nothing rather than
  // a mid-range reading.
  if (isDown) {
    return (
      <span className={ROOT} style={{ width, height }}>
        <svg
          className={chartVariants({ status: 'negative' })}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label ? `${label} is down` : 'Down'}
          onMouseMove={(e) => setHover({ index: 0, ...pointerOver(e) })}
          onMouseLeave={() => setHover(null)}
        >
          <line className={lineVariants({ isFlat: true })} x1={0} y1={baseline} x2={width} y2={baseline} />
        </svg>
        {hover && (
          <HoverTip hover={hover} x={width / 2}>
            Down
          </HoverTip>
        )}
      </span>
    )
  }

  const latest = samples.at(-1)
  if (!latest) {
    return <span className={chartVariants({ isEmpty: true })} style={{ width, height }} aria-hidden="true" />
  }

  const latestMs = latest.ms
  const hovered = hover !== null ? points[hover.index] : null
  const areaRuns = runs.filter((run) => run.length > 1)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (points.length === 0) return
    const { x, left, top } = pointerOver(e)
    setHover({ index: nearestPointIndex(points, x), left, top })
  }

  return (
    <span className={ROOT} style={{ width, height }}>
      <svg
        className={chartVariants({ status: chartStatus(latestMs) })}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={chartDescription(samples, label)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Fades the band colour to transparent, as on the Traffic chart. */}
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {areaRuns.map((run, i) => (
          <polygon
            key={`area-${i}`}
            className="stroke-none"
            points={areaPoints(run, baseline)}
            fill={`url(#${fillId})`}
          />
        ))}
        {runs.map((run, i) =>
          run.length > 1 ? (
            <polyline key={i} className={lineVariants()} points={toSvgPoints(run)} />
          ) : (
            // A one-point polyline renders nothing, so a lone sample is a dot.
            <circle key={i} className="fill-current" cx={run[0].x} cy={run[0].y} r={DOT_RADIUS} />
          ),
        )}
        {/* Baseline ticks for failed probes, red whatever the line's band. */}
        {points.map((p, i) =>
          p.sample.ms === null ? (
            <circle key={`down-${i}`} className="fill-status-negative" cx={p.x} cy={p.y} r={DOT_RADIUS} />
          ) : null,
        )}
        {hovered && (
          <>
            <line className="stroke-line stroke-1" x1={hovered.x} y1={VERTICAL_PAD} x2={hovered.x} y2={baseline} />
            <circle
              className="fill-current stroke-surface stroke-[1.5]"
              cx={hovered.x}
              cy={hovered.y}
              r={CURSOR_DOT_RADIUS}
            />
          </>
        )}
      </svg>
      {hover && hovered && (
        <HoverTip hover={hover} x={hovered.x}>
          {hovered.sample.ms === null ? 'Down' : (formatLatencyMs(hovered.sample.ms) ?? <NoValue />)}
        </HoverTip>
      )}
    </span>
  )
}
