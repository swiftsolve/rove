import { cx } from 'class-variance-authority'
import { useId, useMemo } from 'react'
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { useSmoothScale } from '@/features/live-throughput/hooks/useSmoothScale'
import { buildChartRows, type ChartRow, formatAxisLabel } from '@/features/live-throughput/utils/throughput-chart'
import { CHART_WINDOW_LABEL } from '@/features/live-throughput/utils/throughput-history'

const CHART_HEIGHT = 80
// The right margin leaves room for the y-axis labels.
const CHART_MARGIN = { top: 4, right: 28, bottom: 4, left: 2 }

const AXIS_LABEL_TEXT = 'type-number-small text-tertiary num'

// HTML, not recharts ticks, which ghost and duplicate when the domain changes.
// The 4px inset matches the chart's vertical margin.
const Y_AXIS_LABELS = cx(
  'pointer-events-none absolute top-4 right-0 bottom-4 w-[26px]',
  'flex flex-col items-end justify-between',
  AXIS_LABEL_TEXT,
)

const AREA_DEFAULTS = {
  type: 'monotone',
  strokeLinecap: 'round',
  fillOpacity: 1,
  isAnimationActive: false,
  dot: false,
  activeDot: false,
} as const

type ThroughputChartProps = {
  /** Download samples (Mbps), oldest first. */
  download: number[]
  /** Upload samples (Mbps), oldest first. */
  upload: number[]
  /** The scale's ceiling (Mbps). The chart eases down to it and jumps up. */
  maxMbps: number
}

/** The last minute of download (solid) and upload (dashed) as areas, with a dot on each latest sample. */
export function ThroughputChart({ download, upload, maxMbps }: ThroughputChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const downFillId = `${gradientId}-down`
  const upFillId = `${gradientId}-up`

  const rows = useMemo(() => buildChartRows(download, upload), [download, upload])
  const latest = rows.at(-1)

  const scaleMax = useSmoothScale(maxMbps)

  return (
    <div className="relative [contain:layout]">
      <div className="relative h-[80px]" role="img" aria-label={describeChart(latest)}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={{ width: 600, height: CHART_HEIGHT }}>
          <AreaChart
            data={rows}
            margin={CHART_MARGIN}
            // The wrapper's role="img" label describes the chart and there's no
            // tooltip, so the SVG shouldn't take a dead Tab stop.
            accessibilityLayer={false}
          >
            <defs>
              <linearGradient id={downFillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-down)" className="[stop-opacity:var(--opacity-tint-xl)]" />
                <stop offset="100%" stopColor="var(--series-down)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={upFillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-up)" className="[stop-opacity:var(--opacity-tint-xs)]" />
                <stop offset="100%" stopColor="var(--series-up)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis dataKey="index" type="number" domain={['dataMin', 'dataMax']} hide />
            {/* Only sets the scale; the visible labels are the HTML overlay. */}
            <YAxis domain={[0, scaleMax]} hide />

            <ReferenceLine y={scaleMax / 2} stroke="var(--border-default)" strokeOpacity={0.15} />
            <ReferenceLine y={0} stroke="var(--border-default)" strokeOpacity={0.2} />

            {/* Upload first, so download draws on top of it. */}
            <Area
              {...AREA_DEFAULTS}
              dataKey="up"
              stroke="var(--series-up)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              className="[stroke-opacity:var(--opacity-high)]"
              fill={`url(#${upFillId})`}
            />
            <Area
              {...AREA_DEFAULTS}
              dataKey="down"
              stroke="var(--series-down)"
              strokeWidth={1.75}
              fill={`url(#${downFillId})`}
            />

            {/* A reference dot, not the Area's `dot` renderer, which runs for every
                point on every frame the scale eases. */}
            {latest && (
              <>
                <ReferenceDot
                  x={latest.index}
                  y={latest.up}
                  r={2.25}
                  fill="var(--series-up)"
                  stroke="none"
                  ifOverflow="visible"
                />
                <ReferenceDot
                  x={latest.index}
                  y={latest.down}
                  r={2.5}
                  fill="var(--series-down)"
                  stroke="none"
                  ifOverflow="visible"
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>

        <div className={Y_AXIS_LABELS} aria-hidden>
          <span className="translate-y-[-50%]">{formatAxisLabel(scaleMax)}</span>
          <span>{formatAxisLabel(scaleMax / 2)}</span>
          {/* Centred on the baseline so it lines up with the reference line. */}
          <span className="translate-y-[50%]">0</span>
        </div>
      </div>

      {/* The time axis; its right padding matches the y-axis labels' width. */}
      <div className={cx('mt-6 flex justify-between pr-[26px]', AXIS_LABEL_TEXT)} aria-hidden>
        <span>{CHART_WINDOW_LABEL}</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function describeChart(latest: ChartRow | undefined): string {
  const down = (latest?.down ?? 0).toFixed(1)
  const up = (latest?.up ?? 0).toFixed(1)
  return `Throughput over time. Currently ${down} megabits per second down, ${up} up`
}
