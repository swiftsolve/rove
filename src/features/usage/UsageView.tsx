import { cx } from 'class-variance-authority'
import { type JSX, useState } from 'react'
import type { RectangleProps } from 'recharts'
import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { formatBytes, splitBytes } from '@/lib/format'
import type { DailyUsage } from '@/types'
import {
  Banner,
  Card,
  CardBody,
  CardHeader,
  DirectionIcon,
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

type UsageDatum = {
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

// Full-bleed inset strip; the card's overflow:hidden rounds its bottom corners.
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

function BytesMetric({ label, bytes, series }: { label: string; bytes: number; series: 'down' | 'up' }) {
  const { value, unit } = splitBytes(bytes)
  return <Readout label={label} icon={<DirectionIcon series={series} />} value={value} unit={unit} />
}

/** A card footer: a label on the left, down / up byte totals on the right. */
function TotalsFooter({ label, rxBytes, txBytes }: { label: string; rxBytes: number; txBytes: number }) {
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
function DayTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
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

/** Hovered-bar highlight: the bar capped with a dot, like the line charts'
 *  endpoint dots. Paired with `cursor={false}` so there's no grey band. */
const renderActiveBar =
  (color: string) =>
  ({ x = 0, y = 0, width = 0, height = 0 }: { x?: number; y?: number; width?: number; height?: number }) => (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2} ry={2} fill={color} />
      <circle
        cx={x + width / 2}
        cy={y}
        r={5}
        fill={color}
        // The surface colour, not text-primary, which is near-black in light mode.
        stroke="var(--bg-inset)"
        strokeWidth={1.5}
      />
    </g>
  )

/** A bar as Recharts draws it, or with the hover marker when its day has
 *  keyboard focus: Recharts marks only hovered bars as active. */
const renderBar =
  (color: string, focusedIndex: number | null) =>
  ({ index, ...props }: RectangleProps & { index?: number }) =>
    index === focusedIndex ? renderActiveBar(color)(props) : <Rectangle {...props} />

function WeekChart({ days }: { days: DailyUsage[] }) {
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
      {/* An invisible tab stop per day over the plot; mouse events pass through.
          No focus ring: the tooltip and bar marker show the focused day. */}
      <div
        className="pointer-events-none absolute inset-y-0 flex"
        style={{ left: CHART_SIDE_MARGIN, right: CHART_SIDE_MARGIN }}
      >
        {data.map((point, index) => (
          // Focusable to be read, not to act, so no interactive role fits.
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions
          <div
            key={point.key}
            role="img"
            // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex
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

export function UsageView() {
  const { usage, isLoading, error, reload } = useDataUsage()
  const today = usage.days.at(-1)
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
