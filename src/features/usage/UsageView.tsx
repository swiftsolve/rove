import { useState } from 'react'
import { cx } from 'class-variance-authority'
import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RectangleProps } from 'recharts'
import type { DailyUsage } from '@/types'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { formatBytes, splitBytes } from '@/lib/format'
import {
  Card,
  CardBody,
  CardHeader,
  DirectionIcon,
  Banner,
  HelpIcon,
  IconButton,
  LoadingState,
  PageHeader,
  POLLING_DESCRIPTION,
  Readout,
  TodayIcon,
  UsageIcon,
  WeekIcon,
} from '@/ui'

interface UsageDatum {
  key: string
  label: string
  down: number
  up: number
}

const USAGE_INFO_HINT = 'Measured while Rove runs, across all physical interfaces.'

const CHART_HEIGHT = 124
// The plot's side inset, shared by the chart margin and the day stops over it.
const CHART_SIDE_MARGIN = 4
const BAR_MAX_WIDTH = 9
const BAR_RADIUS: [number, number, number, number] = [2, 2, 1, 1]

// The footer strip: the inset tier, same as the capabilities and speed-test
// footers, with no hairline (the colour step alone separates it). It bleeds to
// the card's left, right and bottom edges, and the card's overflow:hidden rounds
// its bottom corners. Its padding matches the speed-test footer's rhythm. The
// "Since boot" label sits left, the down/up totals grouped at the right.
const TOTALS_FOOTER = cx(
  'type-caption text-tertiary flex items-center justify-between gap-12',
  'mt-12 -mx-(--card-body-padding) -mb-(--card-body-padding) p-(--card-body-padding)',
  'bg-inset',
)

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/** "Today" for the last day, else the short weekday of a `YYYY-MM-DD` key. */
function dayLabel(dateKey: string, isLast: boolean): string {
  if (isLast) return 'Today'
  const [year, month, day] = dateKey.split('-').map(Number)
  return WEEKDAY_FORMAT.format(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

function BytesMetric({ label, bytes, series }: { label: string; bytes: number; series: 'down' | 'up' }): JSX.Element {
  const { value, unit } = splitBytes(bytes)
  return <Readout label={label} icon={<DirectionIcon series={series} />} value={value} unit={unit} />
}

/** A card footer: a label on the left, down / up byte totals on the right. */
function TotalsFooter({ label, rxBytes, txBytes }: { label: string; rxBytes: number; txBytes: number }): JSX.Element {
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
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Recharts names the prop it injects.
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
function DayTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }): JSX.Element {
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

/** A bar as Recharts draws it, or with the hover marker when its day has
 *  keyboard focus: Recharts marks only hovered bars as active. */
const renderBar =
  (color: string, focusedIndex: number | null) =>
  ({ index, ...props }: RectangleProps & { index?: number }): JSX.Element =>
    index === focusedIndex ? renderActiveBar(color)(props) : <Rectangle {...props} />

function WeekChart({ days }: { days: DailyUsage[] }): JSX.Element {
  const data: UsageDatum[] = days.map((day, index) => ({
    key: day.date,
    label: dayLabel(day.date, index === days.length - 1),
    down: day.rxBytes,
    up: day.txBytes,
  }))

  // The day a keyboard user has tabbed to; its tooltip shows as if hovered.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  return (
    <div className="relative" role="group" aria-label="Data used per day, last 7 days">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          // Once a day has been hovered, Recharts keeps showing that day and
          // ignores the tooltip's defaultIndex, so a focus change starts the
          // chart afresh to let the tooltip follow the focused day.
          key={focusedIndex ?? 'pointer'}
          data={data}
          // The day stops below are the keyboard layer, a tab stop per day;
          // Recharts' own would add one more stop that arrows between them.
          accessibilityLayer={false}
          margin={{ top: 8, right: CHART_SIDE_MARGIN, bottom: 0, left: CHART_SIDE_MARGIN }}
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
            active={focusedIndex === null ? undefined : true}
            defaultIndex={focusedIndex ?? undefined}
          />
          <Bar
            dataKey="down"
            fill="var(--series-down)"
            radius={BAR_RADIUS}
            maxBarSize={BAR_MAX_WIDTH}
            isAnimationActive={false}
            activeBar={renderActiveBar('var(--series-down)')}
            shape={renderBar('var(--series-down)', focusedIndex)}
          />
          <Bar
            dataKey="up"
            fill="var(--series-up)"
            radius={BAR_RADIUS}
            maxBarSize={BAR_MAX_WIDTH}
            isAnimationActive={false}
            activeBar={renderActiveBar('var(--series-up)')}
            shape={renderBar('var(--series-up)', focusedIndex)}
          />
        </BarChart>
      </ResponsiveContainer>
      {/* One invisible column per day over the plot, matching the chart's equal
          day bands, so Tab steps through the days. Mouse events pass through to
          the chart. The tooltip and the bars' marker show the focused day, so
          the columns draw no focus ring. */}
      <div
        className="pointer-events-none absolute inset-y-0 flex"
        style={{ left: CHART_SIDE_MARGIN, right: CHART_SIDE_MARGIN }}
      >
        {data.map((point, index) => (
          <div
            key={point.key}
            role="img"
            tabIndex={0}
            aria-label={`${point.label}: ${formatBytes(point.down)} down, ${formatBytes(point.up)} up`}
            className="flex-1 focus-visible:outline-none"
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(null)}
          />
        ))}
      </div>
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
      <PageHeader
        icon={<UsageIcon size={18} />}
        title="Usage"
        description="Download and upload across all interfaces"
        status={isFirstLoad ? 'Loading…' : undefined}
        actions={<IconButton label="About usage measurement" icon={HelpIcon} tooltip={USAGE_INFO_HINT} />}
      />

      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      {isFirstLoad ? (
        <LoadingState label="Loading usage…" />
      ) : (
        <>
          <Card>
            <CardHeader title="Today" icon={<TodayIcon size={15} />} />
            <CardBody>
              {/* Today metrics sit on the plain card surface; the card body's top
                  padding is the only gap below the title. */}
              <dl className="grid grid-cols-2 gap-16">
                <BytesMetric label="Downloaded" bytes={today?.rxBytes ?? 0} series="down" />
                <BytesMetric label="Uploaded" bytes={today?.txBytes ?? 0} series="up" />
              </dl>
              <TotalsFooter label="Since boot" rxBytes={usage.bootRxBytes} txBytes={usage.bootTxBytes} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Last 7 days" icon={<WeekIcon size={15} />} />
            <CardBody>
              <WeekChart days={usage.days} />
              <TotalsFooter label="Week total" rxBytes={weekRx} txBytes={weekTx} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
