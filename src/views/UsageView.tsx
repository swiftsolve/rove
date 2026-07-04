import type { DailyUsage, DataUsageSummary } from '@shared/types'
import { formatBytes, splitBytes } from '../utils/format'
import Section from '../components/ui/Section'
import { ArrowDownIcon, ArrowUpIcon, UsageIcon } from '../components/Icons'
import './UsageView.css'

interface UsageViewProps {
  readonly usage: DataUsageSummary
  readonly isLoading: boolean
}

const CHART_HEIGHT = 96
const MIN_BAR_PX = 2

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
        <span className={`usage-key ${series}`} aria-hidden />
        <span className="field-label">{label}</span>
      </div>
      <div className="metric num" aria-label={`${label}: ${value} ${unit}`}>
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

function WeekChart({ days }: { readonly days: readonly DailyUsage[] }): JSX.Element {
  const peak = Math.max(...days.map((day) => Math.max(day.rxBytes, day.txBytes)), 1)
  const scale = (bytes: number): number =>
    bytes <= 0 ? 0 : Math.max((bytes / peak) * CHART_HEIGHT, MIN_BAR_PX)

  return (
    <div className="usage-chart" role="img" aria-label="Data used per day, last 7 days">
      {days.map((day, index) => (
        <div key={day.date} className="usage-day">
          <div className="usage-bars" style={{ height: CHART_HEIGHT }}>
            <span
              className="usage-bar down"
              style={{ height: scale(day.rxBytes) }}
              title={`${dayLabel(day.date, index === days.length - 1)} · ${formatBytes(day.rxBytes)} down · ${formatBytes(day.txBytes)} up`}
            />
            <span className="usage-bar up" style={{ height: scale(day.txBytes) }} />
          </div>
          <span className={`usage-day-label${index === days.length - 1 ? ' today' : ''}`}>
            {dayLabel(day.date, index === days.length - 1)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function UsageView({ usage, isLoading }: UsageViewProps): JSX.Element {
  const today = usage.days[usage.days.length - 1]
  const weekRx = usage.days.reduce((sum, day) => sum + day.rxBytes, 0)
  const weekTx = usage.days.reduce((sum, day) => sum + day.txBytes, 0)

  if (isLoading && usage.days.length === 0) {
    return (
      <div className="view-empty">
        <div className="spinner" />
        <p className="text-muted">Loading usage…</p>
      </div>
    )
  }

  return (
    <div className="view-page">
      <Section title="Today" icon={<UsageIcon size={15} />}>
        <div className="usage-hero">
          <BytesMetric label="Downloaded" bytes={today?.rxBytes ?? 0} series="down" />
          <BytesMetric label="Uploaded" bytes={today?.txBytes ?? 0} series="up" />
        </div>
        <p className="text-meta usage-session">
          Since boot · <ArrowDownIcon size={11} className="usage-inline-icon" />{' '}
          <span className="num">{formatBytes(usage.bootRxBytes)}</span> ·{' '}
          <ArrowUpIcon size={11} className="usage-inline-icon" />{' '}
          <span className="num">{formatBytes(usage.bootTxBytes)}</span>
        </p>
      </Section>

      <Section title="Last 7 days">
        <WeekChart days={usage.days} />
        <p className="text-meta usage-week-total">
          Week total · <span className="num">{formatBytes(weekRx)}</span> down ·{' '}
          <span className="num">{formatBytes(weekTx)}</span> up
        </p>
      </Section>

      <p className="text-hint usage-note">
        Usage is measured while Beacon is running, across all physical network interfaces.
      </p>
    </div>
  )
}
