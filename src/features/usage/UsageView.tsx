import { cx } from 'class-variance-authority'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyUsage } from '@/types'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { formatBytes, splitBytes } from '@/lib/format'
import { Section } from '@/components/Section'
import { Tooltip as UiTooltip } from '@/components/Tooltip'
import { ViewHeader } from '@/components/ViewHeader'
import { HelpIcon, TodayIcon, UsageIcon, WeekIcon } from '@/components/icons/Icons'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import { Spinner } from '@/components/Spinner'
import { IconButton } from '@/components/IconButton'
import { ErrorBanner, POLLING_DESCRIPTION } from '@/components/ErrorBanner'

interface UsageDatum {
  key: string
  label: string
  down: number
  up: number
}

const USAGE_INFO_HINT =
  'Measured while Rove runs, across all physical interfaces.'

const CHART_HEIGHT = 124
const BAR_MAX_WIDTH = 9
const BAR_RADIUS: [number, number, number, number] = [2, 2, 1, 1]

// The footer strip: the inset tier, same as the capabilities and speed-test
// footers, with no hairline (the colour step alone separates it). It bleeds to
// the card's left, right and bottom edges, and the card's overflow:hidden rounds
// its bottom corners. Its padding matches the speed-test footer's rhythm. The
// "Since boot" label sits left, the down/up totals grouped at the right.
const TOTALS_FOOTER = cx(
  'text-meta flex items-center justify-between gap-12',
  'mt-12 -mx-(--section-body-padding) -mb-(--section-body-padding) p-(--section-body-padding)',
  'bg-inset',
)

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/** "Today" for the last day, else the short weekday of a `YYYY-MM-DD` key. */
function dayLabel(dateKey: string, isLast: boolean): string {
  if (isLast) return 'Today'
  const [year, month, day] = dateKey.split('-').map(Number)
  return WEEKDAY_FORMAT.format(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

function BytesMetric({
  label,
  bytes,
  series,
}: {
  label: string
  bytes: number
  series: 'down' | 'up'
}): JSX.Element {
  const { value, unit } = splitBytes(bytes)

  return (
    <div>
      {/* mb-8 matches the speed-test hero's label→value rhythm. */}
      <dt className="mb-8 flex items-center gap-6">
        <DirectionIcon series={series} />
        <span className="field-label">{label}</span>
      </dt>
      <dd className="metric num">
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </dd>
    </div>
  )
}

/** A section footer: a label on the left, down / up byte totals on the right. */
function TotalsFooter({
  label,
  rxBytes,
  txBytes,
}: {
  label: string
  rxBytes: number
  txBytes: number
}): JSX.Element {
  return (
    <p className={TOTALS_FOOTER}>
      <span>{label}</span>
      <span className="inline-flex items-center gap-12">
        <span className="inline-flex items-center gap-4">
          <DirectionIcon series="down" size={11} />
          <span className="sr-only">Downloaded</span>
          <span className="num">{formatBytes(rxBytes)}</span>
        </span>
        <span className="inline-flex items-center gap-4">
          <DirectionIcon series="up" size={11} />
          <span className="sr-only">Uploaded</span>
          <span className="num">{formatBytes(txBytes)}</span>
        </span>
      </span>
    </p>
  )
}

function UsageTooltip({
  active: isActive,
  payload,
}: {
  active?: boolean
  payload?: { payload: UsageDatum }[]
}): JSX.Element | null {
  const point = isActive ? payload?.[0]?.payload : undefined
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
  x?: number
  y?: number
  payload?: { value?: string }
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
    x?: number
    y?: number
    width?: number
    height?: number
  }): JSX.Element => (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={color} />
      <circle
        cx={x + width / 2}
        cy={y}
        r={5}
        fill={color}
        // Ring in the band's own surface colour (not text-primary) so the dot
        // reads as punched out of the chart in both themes — in light mode a
        // text-primary ring resolved to a harsh near-black outline.
        stroke="var(--bg-inset)"
        strokeWidth={1.5}
      />
    </g>
  )

function WeekChart({ days }: { days: DailyUsage[] }): JSX.Element {
  const data: UsageDatum[] = days.map((day, index) => ({
    key: day.date,
    label: dayLabel(day.date, index === days.length - 1),
    down: day.rxBytes,
    up: day.txBytes,
  }))

  const chartLabel =
    'Data used per day, last 7 days. ' +
    data
      .map((point) => `${point.label}: ${formatBytes(point.down)} down, ${formatBytes(point.up)} up`)
      .join('. ')

  return (
    <div className="relative" role="img" aria-label={chartLabel}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={data}
          // The wrapper is the chart's accessible image; the keyboard layer
          // would put a focusable application inside it.
          accessibilityLayer={false}
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
            radius={BAR_RADIUS}
            maxBarSize={BAR_MAX_WIDTH}
            isAnimationActive={false}
            activeBar={renderActiveBar('var(--series-down)')}
          />
          <Bar
            dataKey="up"
            fill="var(--series-up)"
            radius={BAR_RADIUS}
            maxBarSize={BAR_MAX_WIDTH}
            isAnimationActive={false}
            activeBar={renderActiveBar('var(--series-up)')}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function UsageView(): JSX.Element {
  const { usage, isLoading, error, reload } = useDataUsage()
  const today = usage.days[usage.days.length - 1]
  const weekRx = usage.days.reduce((sum, day) => sum + day.rxBytes, 0)
  const weekTx = usage.days.reduce((sum, day) => sum + day.txBytes, 0)
  const isFirstLoad = isLoading && usage.days.length === 0

  return (
    <div className="page">
      <ViewHeader
        icon={<UsageIcon size={18} />}
        title="Usage"
        subtitle={isFirstLoad ? 'Loading…' : 'Download and upload across all interfaces'}
        isSubtitleShown={!isFirstLoad}
        actions={
          <UiTooltip content={USAGE_INFO_HINT}>
            <IconButton
              aria-label="About usage measurement"
            >
              <HelpIcon size={16} />
            </IconButton>
          </UiTooltip>
        }
      />

      {error && <ErrorBanner title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      {isFirstLoad ? (
        <div className="page-empty" role="status">
          <Spinner />
          <p className="text-muted">Loading usage…</p>
        </div>
      ) : (
        <>
          <Section title="Today" icon={<TodayIcon size={15} />}>
            {/* Today metrics sit on the plain card surface; the section body's top
                padding is the only gap below the title. */}
            <dl className="grid grid-cols-2 gap-16">
              <BytesMetric label="Downloaded" bytes={today?.rxBytes ?? 0} series="down" />
              <BytesMetric label="Uploaded" bytes={today?.txBytes ?? 0} series="up" />
            </dl>
            <TotalsFooter
              label="Since boot"
              rxBytes={usage.bootRxBytes}
              txBytes={usage.bootTxBytes}
            />
          </Section>

          <Section title="Last 7 days" icon={<WeekIcon size={15} />}>
            <WeekChart days={usage.days} />
            <TotalsFooter label="Week total" rxBytes={weekRx} txBytes={weekTx} />
          </Section>
        </>
      )}
    </div>
  )
}
