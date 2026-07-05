import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyUsage, DataUsageSummary } from '@/types'
import { formatBytes, splitBytes } from '@/lib/format'
import Section from '@/components/ui/Section'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { Tooltip as UiTooltip } from '@/components/ui/Tooltip'
import { ArrowDownIcon, ArrowUpIcon, HelpIcon, TodayIcon, UsageIcon, WeekIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import './UsageView.css'

const USAGE_INFO_HINT =
  'Usage is measured while Beacon is running, across all physical network interfaces.'

interface UsageViewProps {
  readonly usage: DataUsageSummary
  readonly isLoading: boolean
  readonly error?: string | null
}

interface UsageDatum {
  readonly key: string
  readonly label: string
  readonly down: number
  readonly up: number
}

function dayLabel(dateKey: string, isLast: boolean): string {
  if (isLast) return 'Today'
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
    new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1),
  )
}

function BytesMetric({
  label,
  bytes,
  series,
}: {
  readonly label: string
  readonly bytes: number
  readonly series: 'down' | 'up'
}): JSX.Element {
  const { value, unit } = splitBytes(bytes)

  return (
    <div className="usage-metric">
      <div className="usage-metric-label">
        <DirectionIcon series={series} />
        <span className="field-label">{label}</span>
      </div>
      <div className="metric num" aria-label={`${label}: ${value} ${unit}`}>
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

function UsageTooltip({
  active,
  payload,
}: {
  readonly active?: boolean
  readonly payload?: ReadonlyArray<{ readonly payload: UsageDatum }>
}): JSX.Element | null {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  // Nothing transferred that day — skip the tooltip rather than showing "0 B / 0 B".
  if (point.down === 0 && point.up === 0) return null

  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{point.label}</div>
      <div className="chart-tip-row">
        <DirectionIcon series="down" size={13} />
        <span className="chart-tip-label">Download</span>
        <span className="chart-tip-value num">{formatBytes(point.down)}</span>
      </div>
      <div className="chart-tip-row">
        <DirectionIcon series="up" size={13} />
        <span className="chart-tip-label">Upload</span>
        <span className="chart-tip-value num">{formatBytes(point.up)}</span>
      </div>
    </div>
  )
}

/** X-axis tick that emphasises "Today". */
function DayTick({
  x,
  y,
  payload,
}: {
  readonly x?: number
  readonly y?: number
  readonly payload?: { readonly value?: string }
}): JSX.Element {
  const value = payload?.value ?? ''
  const isToday = value === 'Today'
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      fill={isToday ? 'var(--text-secondary)' : 'var(--text-tertiary)'}
      fontSize={10}
      fontWeight={isToday ? 500 : 400}
    >
      {value}
    </text>
  )
}

/** Hovered-bar highlight: the bar itself, capped with a dot at its top — the
 *  same marker language as the line charts' endpoint dots, rather than a grey
 *  box behind the whole day. Paired with `cursor={false}` so there's no pill. */
const renderActiveBar =
  (color: string) =>
  ({
    x = 0,
    y = 0,
    width = 0,
    height = 0,
  }: {
    readonly x?: number
    readonly y?: number
    readonly width?: number
    readonly height?: number
  }): JSX.Element => (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={color} />
      <circle
        cx={x + width / 2}
        cy={y}
        r={3}
        fill={color}
        stroke="var(--text-primary)"
        strokeWidth={1.5}
      />
    </g>
  )

function WeekChart({ days }: { readonly days: readonly DailyUsage[] }): JSX.Element {
  const data: UsageDatum[] = days.map((day, index) => ({
    key: day.date,
    label: dayLabel(day.date, index === days.length - 1),
    down: day.rxBytes,
    up: day.txBytes,
  }))

  const chartLabel =
    'Data used per day, last 7 days. ' +
    days
      .map(
        (day, index) =>
          `${dayLabel(day.date, index === days.length - 1)}: ${formatBytes(day.rxBytes)} down, ${formatBytes(day.txBytes)} up`,
      )
      .join('. ')

  return (
    <div className="usage-chart-wrap" role="img" aria-label={chartLabel}>
      <ResponsiveContainer width="100%" height={124}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="26%"
          barGap={3}
        >
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={<DayTick />} interval={0} />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            content={<UsageTooltip />}
            cursor={false}
            wrapperStyle={{ outline: 'none' }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="down"
            fill="var(--series-down)"
            radius={[2, 2, 1, 1]}
            maxBarSize={9}
            isAnimationActive={false}
            activeBar={renderActiveBar('var(--series-down)')}
          />
          <Bar
            dataKey="up"
            fill="var(--series-up)"
            radius={[2, 2, 1, 1]}
            maxBarSize={9}
            isAnimationActive={false}
            activeBar={renderActiveBar('var(--series-up)')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function UsageView({ usage, isLoading, error }: UsageViewProps): JSX.Element {
  const today = usage.days[usage.days.length - 1]
  const weekRx = usage.days.reduce((sum, day) => sum + day.rxBytes, 0)
  const weekTx = usage.days.reduce((sum, day) => sum + day.txBytes, 0)
  const hasData = usage.days.length > 0

  const subtitle =
    isLoading && !hasData
      ? 'Loading…'
      : 'Download and upload across all interfaces'

  return (
    <div className="view-page">
      <div className="view-header usage-header">
        <span className="view-header-icon">
          <UsageIcon size={18} />
        </span>
        <div className="usage-header-text">
          <span className="view-header-title">Usage</span>
          <span className={`usage-header-sub${!(isLoading && !hasData) ? ' show' : ''}`}>
            {subtitle}
          </span>
        </div>
        <div className="usage-header-actions">
          <UiTooltip content={USAGE_INFO_HINT}>
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              aria-label="About usage measurement"
            >
              <HelpIcon size={16} />
            </button>
          </UiTooltip>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {isLoading && !hasData ? (
        <div className="view-empty">
          <div className="spinner" />
          <p className="text-muted">Loading usage…</p>
        </div>
      ) : (
        <>
          <Section title="Today" icon={<TodayIcon size={15} />}>
            <div className="usage-hero">
              <BytesMetric label="Downloaded" bytes={today?.rxBytes ?? 0} series="down" />
              <BytesMetric label="Uploaded" bytes={today?.txBytes ?? 0} series="up" />
            </div>
            <p className="text-meta usage-footer">
              <InlineMeta
                items={[
                  'Since boot',
                  <>
                    <ArrowDownIcon size={11} className="usage-inline-icon" />{' '}
                    <span className="num">{formatBytes(usage.bootRxBytes)}</span>
                  </>,
                  <>
                    <ArrowUpIcon size={11} className="usage-inline-icon" />{' '}
                    <span className="num">{formatBytes(usage.bootTxBytes)}</span>
                  </>,
                ]}
              />
            </p>
          </Section>

          <Section title="Last 7 days" icon={<WeekIcon size={15} />}>
            <WeekChart days={usage.days} />
            <p className="text-meta usage-footer">
              <InlineMeta
                items={[
                  'Week total',
                  <>
                    <span className="num">{formatBytes(weekRx)}</span> down
                  </>,
                  <>
                    <span className="num">{formatBytes(weekTx)}</span> up
                  </>,
                ]}
              />
            </p>
          </Section>
        </>
      )}
    </div>
  )
}
