import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LatencySample } from '@/features/services/utils/service-latency'
import { latencyBand, type LatencyBand } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import { cva, cx } from 'class-variance-authority'

// A row-sized latency chart.
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
    /** The down state's flat baseline. It keeps the trend's stroke weight but
     *  runs the full width with square ends, so it lines up flush with the
     *  status text under it instead of stopping a pad short of either edge. */
    isFlat: { true: '[stroke-linecap:butt]', false: '[stroke-linecap:round]' },
  },
  defaultVariants: { isFlat: false },
})

// The value bubble that follows the hovered point: centred over its x and lifted
// 3px above the chart.
const TIP = cx(
  'pointer-events-none fixed z-9999 -translate-x-1/2 -translate-y-full whitespace-nowrap',
  'rounded-xs border border-line bg-surface px-6 py-2 shadow-panel',
  'font-numeric text-2xs leading-[1.2] text-primary tabular-nums',
)

// The hovered point, and the chart's top-left corner in the window when it was hovered.
interface Hover {
  index: number
  left: number
  top: number
}

interface Point {
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
  /** How many samples the x-axis spans. Fixing this to the history window keeps
   *  the newest sample pinned to the right edge while a partial history fills in
   *  from the left, so a chart that's still filling grows the way a live trend
   *  reads instead of stretching (or sprouting from the middle at one sample).
   *  Defaults to the sample count, which stretches them across the full width. */
  slots?: number
  /** The service is currently down: draw a single flat red line instead of the
   *  latency trend, along the baseline, so an outage never reads as a
   *  healthy-looking chart. */
  isDown?: boolean
}

// A little vertical inset so the stroke and the dots aren't clipped at the top
// and bottom. There's no horizontal inset: the line runs edge to edge so its
// ends line up with the text above and below it (the svg doesn't clip, so the
// round caps and dots can overhang the edges a touch).
const VERTICAL_PAD = 3

const DOT_RADIUS = 1.5
const CURSOR_DOT_RADIUS = 2.5

/** Health band for a latency, matching the numeric readout's colour thresholds. */
function chartStatus(ms: number | null): LatencyBand {
  if (ms === null) return 'negative'
  return latencyBand(ms)
}

/** An SVG `points` list for a run of points. */
function toSvgPoints(run: Point[]): string {
  return run.map((p) => `${p.x},${p.y}`).join(' ')
}

/** Lay the samples out in the chart's box, oldest on the left. */
function placePoints(samples: LatencySample[], width: number, height: number, slots: number | undefined): Point[] {
  const sampleCount = samples.length
  const innerHeight = height - VERTICAL_PAD * 2
  // The axis spans the full history window even before it has filled, so the
  // newest sample always sits at the right edge.
  const span = Math.max(slots ?? sampleCount, sampleCount)

  // Scale y over the observed latency range, with a small floor so a flat run
  // of identical values still draws a centred line rather than pinning an edge.
  const values = samples.map((s) => s.ms).filter((ms): ms is number => ms !== null)
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 1
  const isFlat = max === min

  // Right-aligned: the last sample lands on the right edge and older ones step
  // back leftwards, leaving the unfilled part of the window blank.
  const xAt = (i: number): number => (span <= 1 ? width : ((span - sampleCount + i) / (span - 1)) * width)
  // Higher latency sits higher on the chart, so a spike reads as a spike. A run
  // of identical values has no range to scale over, so it sits on the midline.
  const yAt = (ms: number): number =>
    isFlat ? VERTICAL_PAD + innerHeight / 2 : VERTICAL_PAD + innerHeight - ((ms - min) / (max - min)) * innerHeight

  return samples.map((sample, i) => ({
    x: xAt(i),
    y: sample.ms === null ? height - VERTICAL_PAD : yAt(sample.ms),
    sample,
  }))
}

// Split the line into runs of consecutive reachable samples, so a "down"
// sample leaves a gap instead of a line diving to the baseline and back.
function splitIntoRuns(points: Point[]): Point[][] {
  const runs: Point[][] = []
  let run: Point[] = []
  for (const point of points) {
    if (point.sample.ms === null) {
      if (run.length > 0) runs.push(run)
      run = []
    } else {
      run.push(point)
    }
  }
  if (run.length > 0) runs.push(run)
  return runs
}

// A soft area under a line run, closed down to the baseline, for the gradient fill.
function areaPoints(run: Point[], baseline: number): string {
  const firstX = run[0]!.x
  const lastX = run[run.length - 1]!.x
  return `${toSvgPoints(run)} ${lastX},${baseline} ${firstX},${baseline}`
}

/** The chart's spoken summary: how many checks it spans, their latency range and
 *  how many failed, e.g. "GitHub latency over the last 24 checks: 18.2 ms to 42.0 ms, 1 failed". */
function chartDescription(samples: LatencySample[], label: string | undefined): string {
  const subject = label ? `${label} latency` : 'Latency'
  const checks = `${samples.length} ${samples.length === 1 ? 'check' : 'checks'}`
  const values = samples.map((s) => s.ms).filter((ms): ms is number => ms !== null)
  const failedCount = samples.length - values.length
  const facts: string[] = []
  if (values.length > 0) {
    const min = Math.min(...values)
    const max = Math.max(...values)
    facts.push(min === max ? formatLatencyMs(min) : `${formatLatencyMs(min)} to ${formatLatencyMs(max)}`)
  }
  if (failedCount > 0) facts.push(`${failedCount} failed`)
  return `${subject} over the last ${checks}: ${facts.join(', ')}`
}

/** The index of the point nearest to `x` horizontally. */
function nearestPointIndex(points: Point[], x: number): number {
  let nearest = 0
  let bestDistance = Infinity
  for (let i = 0; i < points.length; i++) {
    const distance = Math.abs(points[i]!.x - x)
    if (distance < bestDistance) {
      bestDistance = distance
      nearest = i
    }
  }
  return nearest
}

/** Where the pointer is over the chart: its x within it, and the chart's corner in the window. */
function pointerOver(e: React.MouseEvent<SVGSVGElement>): { x: number; left: number; top: number } {
  const rect = e.currentTarget.getBoundingClientRect()
  return { x: e.clientX - rect.left, left: rect.left, top: rect.top }
}

/** The value bubble, portalled so the card the row sits in never clips it. */
function HoverTip({ hover, x, children }: { hover: Hover; x: number; children: ReactNode }): JSX.Element {
  return createPortal(
    <span className={TIP} style={{ left: hover.left + x, top: hover.top - 3 }} aria-hidden="true">
      {children}
    </span>,
    document.body,
  )
}

/**
 * A tiny latency chart for a service row: the recent handshake times drawn as a
 * line, coloured by the latest reading's health band. Failed probes (null ms)
 * break the line and drop a marker to the baseline. Hovering a point reveals its
 * value in a small floating label. A down service is shown as a single flat red
 * baseline rather than its (now meaningless) trend.
 */
export function Sparkline({
  samples,
  width = 76,
  height = 22,
  label,
  slots,
  isDown = false,
}: SparklineProps): JSX.Element {
  const [hover, setHover] = useState<Hover | null>(null)
  const isHovered = hover !== null
  // Unique per instance so multiple sparklines on a page don't share a gradient.
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

  // A down service reads as a single flat red line — its latency trend is
  // meaningless once it's unreachable, and a green-looking chart on a down row is
  // worse than none. It sits on the baseline, where failed probes drop to, so it
  // reads as "nothing" rather than a mid-range reading. Hovering it says "Down".
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

  if (samples.length === 0) {
    return <span className={chartVariants({ isEmpty: true })} style={{ width, height }} aria-hidden="true" />
  }

  const latestMs = samples[samples.length - 1]!.ms
  const hovered = hover !== null ? points[hover.index] : null
  // Only multi-point runs get an area — a lone point has none.
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
        {/* Area fill under the trend — a vertical fade from the band colour to
            transparent, echoing the Traffic chart. currentColor ties it to
            the active health band. */}
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Its fill is the gradient above; it never draws an outline. */}
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
            // A lone reachable sample between gaps: draw it as a dot, since a
            // one-point polyline renders nothing.
            <circle key={i} className="fill-current" cx={run[0]!.x} cy={run[0]!.y} r={DOT_RADIUS} />
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
          {hovered.sample.ms === null ? 'Down' : formatLatencyMs(hovered.sample.ms)}
        </HoverTip>
      )}
    </span>
  )
}
