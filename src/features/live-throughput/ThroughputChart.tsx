import { useId, useMemo } from 'react'
import { cx } from 'class-variance-authority'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { getLinkCapacityMbps, sanitizeRate } from '@/types'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { resolveChartScale } from '@/features/live-throughput/utils/chart-scale'
import { useSmoothScale } from '@/features/live-throughput/hooks/useSmoothScale'
import { formatChartWindowLabel } from '@/features/live-throughput/utils/throughput-history'

// Scale labels are HTML rather than recharts ticks: recharts' own tick labels
// ghost/duplicate when the domain changes. The 4px inset matches the AreaChart
// margin ({ top: 4, bottom: 4 }) so the ticks line up with the plot.
const SCALE = cx(
  'pointer-events-none absolute top-[4px] right-[0] bottom-[4px] w-[26px]',
  'flex flex-col items-end justify-between',
)

interface ThroughputChartProps {
  download: number[]
  upload: number[]
}

interface ChartDatum {
  index: number
  down: number
  up: number
}

interface EndDotProps {
  cx?: number
  cy?: number
  index?: number
}

const CHART_HEIGHT = 80

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

export function ThroughputChart({ download, upload }: ThroughputChartProps): JSX.Element {
  // A running speed test saturates the link, and the link's capacity bounds the
  // scale, so both feed the y-axis.
  const { info } = useNetwork()
  const { isTesting: isSpeedTestRunning } = useSpeedTest()
  const linkCapacityMbps = info ? getLinkCapacityMbps(info) : null
  const gradientId = useId().replace(/:/g, '')
  const downFill = `${gradientId}-down`
  const upFill = `${gradientId}-up`

  // Scale + row data recompute together, only when the inputs change —
  // not on every 1 Hz render.
  const { data, maxValue } = useMemo(() => ({
    data: buildChartRows(download, upload),
    maxValue: resolveChartScale(download, upload, { linkCapacityMbps, isSpeedTestRunning }),
  }), [download, upload, linkCapacityMbps, isSpeedTestRunning])

  // Glide the axis toward a smaller scale so the trace doesn't jump taller all
  // at once; spikes still expand the scale instantly (see useSmoothScale).
  const scaleMax = useSmoothScale(maxValue)

  const lastIndex = data.length - 1
  const currentDown = sanitizeRate(download.at(-1) ?? 0)
  const currentUp = sanitizeRate(upload.at(-1) ?? 0)

  // A single endpoint marker on the latest sample.
  const renderEndDot =
    (color: string, radius: number) =>
    (props: EndDotProps) => {
      const { cx: centerX, cy: centerY, index } = props
      if (index !== lastIndex || centerX == null || centerY == null) return <g key={`e-${index}`} />
      return <circle key={`e-${index}`} cx={centerX} cy={centerY} r={radius} fill={color} />
    }

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
            margin={{ top: 4, right: 28, bottom: 4, left: 2 }}
            // The wrapper's role="img" label already describes the chart, and there's
            // no tooltip to drive — so don't let the SVG take a dead Tab stop.
            accessibilityLayer={false}
          >
            <defs>
              <linearGradient id={downFill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-down)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--series-down)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={upFill} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-up)" stopOpacity={0.08} />
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
              strokeOpacity={0.8}
              strokeLinecap="round"
              fill={`url(#${upFill})`}
              fillOpacity={1}
              isAnimationActive={false}
              dot={renderEndDot('var(--series-up)', 2.25)}
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
              dot={renderEndDot('var(--series-down)', 2.5)}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        <div className={cx(SCALE, 'text-chart-label', 'num')} aria-hidden>
          <span className="translate-y-[-50%]">{formatAxis(scaleMax)}</span>
          <span>{formatAxis(scaleMax / 2)}</span>
          {/* Centred on the bottom edge (the y=0 baseline), mirroring the top
              label, so it lines up with the reference line. */}
          <span className="translate-y-[50%]">0</span>
        </div>
      </div>

      {/* Same .text-chart-label type as the scale, so the x and y labels read as one set. */}
      <div className={cx('mt-6 flex justify-between pr-[26px]', 'text-chart-label', 'num')} aria-hidden>
        <span>{formatChartWindowLabel()}</span>
        <span>Now</span>
      </div>
    </div>
  )
}
