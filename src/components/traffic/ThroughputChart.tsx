import { useId, useMemo } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { sanitizeRate } from '@/types'
import { resolveChartScale } from '@/lib/chart-scale'
import { useSmoothScale } from '@/hooks/useSmoothScale'
import { formatChartWindowLabel } from '@/components/traffic/throughput-history'
import './ThroughputChart.css'

interface ThroughputChartProps {
  readonly download: readonly number[]
  readonly upload: readonly number[]
  readonly speedTestRunning?: boolean
  readonly linkCapacityMbps?: number | null
}

interface ChartDatum {
  readonly index: number
  readonly down: number
  readonly up: number
}

/** Trim to a clean, consistent tick: no trailing ".0", 1 decimal only below 10. */
function trimNum(value: number): string {
  return String(Number(value.toFixed(value >= 10 ? 0 : 1)))
}

function formatAxis(mbps: number): string {
  const safe = sanitizeRate(mbps)
  if (safe === 0) return '0'
  if (safe >= 1000) return `${trimNum(safe / 1000)}G`
  return `${trimNum(safe)}M`
}

export default function ThroughputChart({
  download,
  upload,
  speedTestRunning = false,
  linkCapacityMbps = null,
}: ThroughputChartProps): JSX.Element {
  const gradientId = useId().replace(/:/g, '')
  const downFill = `${gradientId}-down`
  const upFill = `${gradientId}-up`

  // Scale + row data recompute together, only when the inputs change —
  // not on every 1 Hz render.
  const { data, maxValue } = useMemo(() => {
    const max = resolveChartScale(download, upload, { linkCapacityMbps, speedTestRunning })
    const total = Math.max(download.length, upload.length)
    const rows: ChartDatum[] = Array.from({ length: total }, (_, index) => ({
      index,
      down: sanitizeRate(download[index] ?? 0),
      up: sanitizeRate(upload[index] ?? 0),
    }))
    return { data: rows, maxValue: max }
  }, [download, upload, linkCapacityMbps, speedTestRunning])

  // Glide the axis toward a smaller scale so the trace doesn't jump taller all
  // at once; spikes still expand the scale instantly (see useSmoothScale).
  const scaleMax = useSmoothScale(maxValue)

  const lastIndex = data.length - 1
  const currentDown = sanitizeRate(download.at(-1) ?? 0)
  const currentUp = sanitizeRate(upload.at(-1) ?? 0)

  // A single endpoint marker on the latest sample, matching the old design.
  const renderEndDot =
    (color: string, radius: number) =>
    (props: { readonly cx?: number; readonly cy?: number; readonly index?: number }) => {
      const { cx, cy, index } = props
      if (index !== lastIndex || cx == null || cy == null) return <g key={`e-${index}`} />
      return <circle key={`e-${index}`} cx={cx} cy={cy} r={radius} fill={color} />
    }

  return (
    <div className="tp-chart">
      <div
        className="tp-chart-plot"
        role="img"
        aria-label={`Throughput over time. Currently ${currentDown.toFixed(1)} megabits per second down, ${currentUp.toFixed(1)} up`}
      >
        <ResponsiveContainer width="100%" height={80} initialDimension={{ width: 600, height: 80 }}>
          <AreaChart data={data} margin={{ top: 4, right: 28, bottom: 4, left: 2 }}>
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

        <div className="tp-chart-scale num" aria-hidden>
          <span>{formatAxis(scaleMax)}</span>
          <span>{formatAxis(scaleMax / 2)}</span>
          <span>0</span>
        </div>
      </div>

      <div className="tp-chart-axis num" aria-hidden>
        <span>{formatChartWindowLabel()}</span>
        <span>Now</span>
      </div>
    </div>
  )
}
