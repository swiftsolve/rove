import { useId, useMemo, useRef, useState } from 'react'
import type { LatencySample } from '@/features/services/utils/service-latency'
import { latencyBand, type LatencyBand } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './Sparkline.module.css'

interface Point {
  x: number
  y: number
  sample: LatencySample
}

interface SparklineProps {
  /** Recent latency readings, oldest first. */
  samples: LatencySample[]
  width?: number
  height?: number
  /** Accessible label for the whole chart, e.g. the service name. */
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
function chartLevel(ms: number | null): LatencyBand {
  if (ms === null) return 'bad'
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
  const xAt = (i: number): number =>
    span <= 1 ? width : ((span - sampleCount + i) / (span - 1)) * width
  // Higher latency sits higher on the chart, so a spike reads as a spike. A run
  // of identical values has no range to scale over, so it sits on the midline.
  const yAt = (ms: number): number =>
    isFlat
      ? VERTICAL_PAD + innerHeight / 2
      : VERTICAL_PAD + innerHeight - ((ms - min) / (max - min)) * innerHeight

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
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  // Unique per instance so multiple sparklines on a page don't share a gradient.
  const fillId = useId().replace(/:/g, '')
  const baseline = height - VERTICAL_PAD

  const { points, runs } = useMemo(() => {
    const placed = placePoints(samples, width, height, slots)
    return { points: placed, runs: splitIntoRuns(placed) }
  }, [samples, width, height, slots])

  // A down service reads as a single flat red line — its latency trend is
  // meaningless once it's unreachable, and a green-looking chart on a down row is
  // worse than none. It sits on the baseline, where failed probes drop to, so it
  // reads as "nothing" rather than a mid-range reading. Hovering it says "Down".
  if (isDown) {
    return (
      <span className={styles.root} style={{ width, height }}>
        <svg
          className={styles.chart}
          data-level="bad"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label ? `${label} is down` : 'Down'}
          onMouseMove={() => setHoveredIndex(0)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <line className={cx(styles.line, styles.isFlat)} x1={0} y1={baseline} x2={width} y2={baseline} />
        </svg>
        {hoveredIndex !== null && (
          <span className={styles.tip} style={{ left: '50%' }} role="status">
            Down
          </span>
        )}
      </span>
    )
  }

  if (samples.length === 0) {
    return <span className={cx(styles.chart, styles.isEmpty)} style={{ width, height }} aria-hidden="true" />
  }

  const latestMs = samples[samples.length - 1]!.ms
  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null
  // Only multi-point runs get an area — a lone point has none.
  const areaRuns = runs.filter((run) => run.length > 1)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || points.length === 0) return
    setHoveredIndex(nearestPointIndex(points, e.clientX - rect.left))
  }

  return (
    <span className={styles.root} style={{ width, height }}>
      <svg
        ref={svgRef}
        className={styles.chart}
        data-level={chartLevel(latestMs)}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label ? `${label} latency history` : 'Latency history'}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
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
        {areaRuns.map((run, i) => (
          <polygon
            key={`area-${i}`}
            className={styles.area}
            points={areaPoints(run, baseline)}
            fill={`url(#${fillId})`}
          />
        ))}
        {runs.map((run, i) =>
          run.length > 1 ? (
            <polyline key={i} className={styles.line} points={toSvgPoints(run)} />
          ) : (
            // A lone reachable sample between gaps: draw it as a dot, since a
            // one-point polyline renders nothing.
            <circle key={i} className={styles.soloDot} cx={run[0]!.x} cy={run[0]!.y} r={DOT_RADIUS} />
          ),
        )}
        {/* Baseline ticks for failed probes. */}
        {points.map((p, i) =>
          p.sample.ms === null ? (
            <circle key={`down-${i}`} className={styles.downMark} cx={p.x} cy={p.y} r={DOT_RADIUS} />
          ) : null,
        )}
        {hovered && (
          <>
            <line
              className={styles.cursor}
              x1={hovered.x}
              y1={VERTICAL_PAD}
              x2={hovered.x}
              y2={baseline}
            />
            <circle className={styles.cursorDot} cx={hovered.x} cy={hovered.y} r={CURSOR_DOT_RADIUS} />
          </>
        )}
      </svg>
      {hovered && (
        <span
          className={styles.tip}
          style={{ left: `${(hovered.x / width) * 100}%` }}
          role="status"
        >
          {hovered.sample.ms === null ? 'Down' : formatLatencyMs(hovered.sample.ms)}
        </span>
      )}
    </span>
  )
}
