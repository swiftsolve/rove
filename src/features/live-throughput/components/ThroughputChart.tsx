import { useId, useMemo } from 'react'
import { cx } from 'class-variance-authority'
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { sanitizeRate } from '@/types'
import { useSmoothScale } from '@/features/live-throughput/hooks/useSmoothScale'
import { formatChartWindowLabel } from '@/features/live-throughput/utils/throughput-history'

// Scale labels are HTML rather than recharts ticks: recharts' own tick labels
// ghost/duplicate when the domain changes. The 4px inset matches the AreaChart
// margin ({ top: 4, bottom: 4 }) so the ticks line up with the plot.
const SCALE = cx(
  'pointer-events-none absolute top-4 right-0 bottom-4 w-[26px]',
  'flex flex-col items-end justify-between',
)

interface ThroughputChartProps {
  download: number[]
  upload: number[]
  /** The scale's ceiling (Mbps); it eases down and jumps up (useSmoothScale). */
  maxValue: number
}

interface ChartDatum {
  index: number
  down: number
  up: number
}

const CHART_HEIGHT = 80
// Hoisted so each render hands recharts the same object.
const CHART_MARGIN = { top: 4, right: 28, bottom: 4, left: 2 }

/** Trim to a clean, consistent tick: no trailing ".0", 1 decimal only below 10. */
function trimNumber(value: number): string {
  return String(Number(value.toFixed(value >= 10 ? 0 : 1)))
}

function formatAxis(mbps: number): string {
  const safe = sanitizeRate(mbps)
  if (safe === 0) return '0'
  if (safe >= 1000) return `${trimNumber(safe / 1000)}G`
  return `${trimNumber(safe)}M`
}

/** One chart row per sample index; a missing sample reads as zero. */
function buildChartRows(download: number[], upload: number[]): ChartDatum[] {
  const total = Math.max(download.length, upload.length)
  const rows: ChartDatum[] = Array.from({ length: total }, (_, index) => ({
    index,
    down: sanitizeRate(download[index] ?? 0),
    up: sanitizeRate(upload[index] ?? 0),
  }))
  // A lone sample renders as a dot centered in the plot (the x-domain collapses
  // to a single value). Seed a leading zero so the first sample draws as a short
  // line anchored to the right ("Now") instead, matching the steady-state trace.
  const first = rows[0]
  if (rows.length === 1 && first) {
    rows.unshift({ index: first.index - 1, down: 0, up: 0 })
  }
  return rows
}

export function ThroughputChart({ download, upload, maxValue }: ThroughputChartProps): JSX.Element {
  const gradientId = useId().replace(/:/g, '')
  const downFill = `${gradientId}-down`
  const upFill = `${gradientId}-up`

  // Recomputed only when the samples change, not on every 1 Hz render.
  const data = useMemo(() => buildChartRows(download, upload), [download, upload])

  // Glide the axis toward a smaller scale so the trace doesn't jump taller all
  // at once; spikes still expand the scale instantly (see useSmoothScale).
  const scaleMax = useSmoothScale(maxValue)

  const latest = data.at(-1)
  const currentDown = sanitizeRate(download.at(-1) ?? 0)
  const currentUp = sanitizeRate(upload.at(-1) ?? 0)

  return (
    <div className="relative [contain:layout]">
      <div
        className="relative h-[80px]"
        role="img"
        aria-label={`Throughput over time. Currently ${currentDown.toFixed(1)} megabits per second down, ${currentUp.toFixed(1)} up`}
      >
        <ResponsiveContainer
          width="100%"
          height={CHART_HEIGHT}
          initialDimension={{ width: 600, height: CHART_HEIGHT }}
        >
          <AreaChart
            data={data}
            margin={CHART_MARGIN}
            // The wrapper's role="img" label already describes the chart, and there's
            // no tooltip to drive — so don't let the SVG take a dead Tab stop.
            accessibilityLayer={false}
          >
            <defs>
              <linearGradient id={downFill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-down)" className="[stop-opacity:var(--opacity-tint-xl)]" />
                <stop offset="100%" stopColor="var(--series-down)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={upFill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-up)" className="[stop-opacity:var(--opacity-tint-xs)]" />
                <stop offset="100%" stopColor="var(--series-up)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis dataKey="index" type="number" domain={['dataMin', 'dataMax']} hide />
            {/* Hidden: defines the [0, maxValue] scale for the areas and reference
                lines. The visible scale labels are a stable HTML overlay below —
                recharts' own tick labels ghost/duplicate when the domain changes. */}
            <YAxis domain={[0, scaleMax]} hide />

            <ReferenceLine y={scaleMax / 2} stroke="var(--border-strong)" strokeOpacity={0.15} />
            <ReferenceLine y={0} stroke="var(--border-strong)" strokeOpacity={0.2} />

            <Area
              type="monotone"
              dataKey="up"
              stroke="var(--series-up)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              className="[stroke-opacity:var(--opacity-high)]"
              strokeLinecap="round"
              fill={`url(#${upFill})`}
              fillOpacity={1}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="down"
              stroke="var(--series-down)"
              strokeWidth={1.75}
              strokeLinecap="round"
              fill={`url(#${downFill})`}
              fillOpacity={1}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />

            {/* One endpoint marker per series on the latest sample. A reference
                dot draws just that one, where an Area's `dot` renderer runs for
                every point on every frame the scale eases. */}
            {latest && (
              <>
                <ReferenceDot x={latest.index} y={latest.up} r={2.25} fill="var(--series-up)" stroke="none" ifOverflow="visible" />
                <ReferenceDot x={latest.index} y={latest.down} r={2.5} fill="var(--series-down)" stroke="none" ifOverflow="visible" />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>

        <div className={cx(SCALE, 'text-number-small', 'num')} aria-hidden>
          <span className="translate-y-[-50%]">{formatAxis(scaleMax)}</span>
          <span>{formatAxis(scaleMax / 2)}</span>
          {/* Centred on the bottom edge (the y=0 baseline), mirroring the top
              label, so it lines up with the reference line. */}
          <span className="translate-y-[50%]">0</span>
        </div>
      </div>

      {/* Same .text-number-small type as the scale, so the x and y labels read as one set. */}
      <div className={cx('mt-6 flex justify-between pr-[26px]', 'text-number-small', 'num')} aria-hidden>
        <span>{formatChartWindowLabel()}</span>
        <span>Now</span>
      </div>
    </div>
  )
}
