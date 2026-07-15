import { useId, useMemo, useRef, useState } from 'react'
import type { LatencySample } from '@/components/diagnostics/service-latency'
import { formatLatencyMs } from '@/lib/format'
import './Sparkline.css'

/** Health band for a latency, matching the numeric readout's colour thresholds. */
function levelClass(ms: number | null): string {
  if (ms === null) return 'spark-bad'
  if (ms <= 120) return 'spark-good'
  if (ms <= 300) return 'spark-warn'
  return 'spark-bad'
}

interface Point {
  readonly x: number
  readonly y: number
  readonly sample: LatencySample
}

interface SparklineProps {
  /** Recent latency readings, oldest first. */
  readonly samples: readonly LatencySample[]
  readonly width?: number
  readonly height?: number
  /** Accessible label for the whole chart, e.g. the service name. */
  readonly label?: string
  /** The service is currently down: draw a single flat red line instead of the
   *  latency trend, so an outage never reads as a healthy-looking chart. */
  readonly down?: boolean
}

// A little inset so the stroke and the end dots aren't clipped at the edges.
const PAD = 3

/**
 * A tiny latency chart for a service row: the recent handshake times drawn as a
 * line, coloured by the latest reading's health band. Failed probes (null ms)
 * break the line and drop a marker to the baseline. Hovering a point reveals its
 * value in a small floating label. A down service is shown as a single flat red
 * line rather than its (now meaningless) trend.
 */
export function Sparkline({
  samples,
  width = 76,
  height = 22,
  label,
  down = false,
}: SparklineProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  // Unique per instance so multiple sparklines on a page don't share a gradient.
  const fillId = useId().replace(/:/g, '')

  const { points, segments, areas } = useMemo(() => {
    const n = samples.length
    const innerW = width - PAD * 2
    const innerH = height - PAD * 2

    // Scale y over the observed latency range, with a small floor so a flat run
    // of identical values still draws a centred line rather than pinning an edge.
    const values = samples.map((s) => s.ms).filter((m): m is number => m !== null)
    const min = values.length > 0 ? Math.min(...values) : 0
    const max = values.length > 0 ? Math.max(...values) : 1
    const flat = max === min

    const xAt = (i: number): number => (n <= 1 ? PAD + innerW / 2 : PAD + (i / (n - 1)) * innerW)
    // Higher latency sits higher on the chart, so a spike reads as a spike. A run
    // of identical values has no range to scale over, so it sits on the midline.
    const yAt = (ms: number): number =>
      flat ? PAD + innerH / 2 : PAD + innerH - ((ms - min) / (max - min)) * innerH

    const pts: Point[] = samples.map((sample, i) => ({
      x: xAt(i),
      y: sample.ms === null ? height - PAD : yAt(sample.ms),
      sample,
    }))

    // Split the line into runs of consecutive reachable samples, so a "down"
    // sample leaves a gap instead of a line diving to the baseline and back.
    const segs: string[] = []
    let run: Point[] = []
    for (const p of pts) {
      if (p.sample.ms === null) {
        if (run.length > 0) segs.push(run.map((r) => `${r.x},${r.y}`).join(' '))
        run = []
      } else {
        run.push(p)
      }
    }
    if (run.length > 0) segs.push(run.map((r) => `${r.x},${r.y}`).join(' '))

    // A soft area under each line run, closed down to the baseline, for the
    // gradient fill — only for multi-point runs (a lone point has no area).
    const baseline = height - PAD
    const areaPolys = segs
      .filter((s) => s.includes(' '))
      .map((s) => {
        const coords = s.split(' ')
        const firstX = coords[0]!.split(',')[0]!
        const lastX = coords[coords.length - 1]!.split(',')[0]!
        return `${s} ${lastX},${baseline} ${firstX},${baseline}`
      })

    return { points: pts, segments: segs, areas: areaPolys }
  }, [samples, width, height])

  // A down service reads as a single flat red line — its latency trend is
  // meaningless once it's unreachable, and a green-looking chart on a down row is
  // worse than none. Hovering it just says "Down".
  if (down) {
    const midY = height / 2
    return (
      <span className="spark-wrap" style={{ width, height }}>
        <svg
          className="spark spark-bad"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label ? `${label} is down` : 'Down'}
          onMouseMove={() => setHover(0)}
          onMouseLeave={() => setHover(null)}
        >
          <line className="spark-line spark-flat" x1={PAD} y1={midY} x2={width - PAD} y2={midY} />
        </svg>
        {hover !== null && (
          <span className="spark-tip" style={{ left: '50%' }} role="status">
            Down
          </span>
        )}
      </span>
    )
  }

  if (samples.length === 0) {
    return <span className="spark spark-empty" style={{ width, height }} aria-hidden="true" />
  }

  const latest = samples[samples.length - 1]!.ms
  const hovered = hover !== null ? points[hover] : null

  const handleMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || points.length === 0) return
    const x = e.clientX - rect.left
    // Snap to the nearest sample by x-position.
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i]!.x - x)
      if (d < best) {
        best = d
        nearest = i
      }
    }
    setHover(nearest)
  }

  return (
    <span className="spark-wrap" style={{ width, height }}>
      <svg
        ref={svgRef}
        className={`spark ${levelClass(latest)}`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label ? `${label} latency history` : 'Latency history'}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Area fill under the trend — a vertical fade from the band colour to
            transparent, echoing the Live traffic chart. currentColor ties it to
            the active health band. */}
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {areas.map((pts, i) => (
          <polygon key={`area-${i}`} className="spark-area" points={pts} fill={`url(#${fillId})`} />
        ))}
        {segments.map((pts, i) =>
          pts.includes(' ') ? (
            <polyline key={i} className="spark-line" points={pts} />
          ) : (
            // A lone reachable sample between gaps: draw it as a dot, since a
            // one-point polyline renders nothing.
            <circle key={i} className="spark-dot-solo" cx={pts.split(',')[0]} cy={pts.split(',')[1]} r={1.5} />
          ),
        )}
        {/* Baseline ticks for failed probes. */}
        {points.map((p, i) =>
          p.sample.ms === null ? (
            <circle key={`down-${i}`} className="spark-down" cx={p.x} cy={p.y} r={1.5} />
          ) : null,
        )}
        {hovered && (
          <>
            <line
              className="spark-cursor"
              x1={hovered.x}
              y1={PAD}
              x2={hovered.x}
              y2={height - PAD}
            />
            <circle className="spark-cursor-dot" cx={hovered.x} cy={hovered.y} r={2.5} />
          </>
        )}
      </svg>
      {hovered && (
        <span
          className="spark-tip"
          style={{ left: `${(hovered.x / width) * 100}%` }}
          role="status"
        >
          {hovered.sample.ms === null ? 'Down' : formatLatencyMs(hovered.sample.ms)}
        </span>
      )}
    </span>
  )
}
