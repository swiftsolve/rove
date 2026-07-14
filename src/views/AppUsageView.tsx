import type { AppUsage, AppUsageSummary } from '@/types'
import { formatBytes, formatTimeAgo } from '@/lib/format'
import Section from '@/components/ui/Section'
import { Tooltip as UiTooltip } from '@/components/ui/Tooltip'
import { ViewHeader } from '@/components/ui/ViewHeader'
import { AppsIcon, HelpIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { Spinner } from '@/components/ui/Spinner'
import './AppUsageView.css'

const APP_USAGE_INFO_HINT =
  'Bytes are attributed to the app that moved them, read from the OS per-process ' +
  'network counters while Rove is running. Totals reset when Rove restarts.'

interface AppUsageViewProps {
  readonly usage: AppUsageSummary
  readonly isLoading: boolean
  readonly error?: string | null
}

/** One app's row: name, a proportional bar, and its down/up figures. */
function AppRow({ app, max }: { readonly app: AppUsage; readonly max: number }): JSX.Element {
  const total = app.rxBytes + app.txBytes
  // Split the bar into down/up segments, each scaled against the busiest app so
  // the rows are comparable at a glance. Guard the divide for the all-zero case.
  const scale = max > 0 ? 100 / max : 0
  const downPct = app.rxBytes * scale
  const upPct = app.txBytes * scale

  return (
    <li className="app-row">
      <div className="app-row-head">
        <span className="app-row-name" title={app.name}>
          {app.name}
        </span>
        <span className="app-row-total num">{formatBytes(total)}</span>
      </div>
      <div
        className="app-row-bar"
        role="img"
        aria-label={`${formatBytes(app.rxBytes)} down, ${formatBytes(app.txBytes)} up`}
      >
        <span className="app-row-seg app-row-seg--down" style={{ width: `${downPct}%` }} />
        <span className="app-row-seg app-row-seg--up" style={{ width: `${upPct}%` }} />
      </div>
      <div className="app-row-figures">
        <span className="app-row-figure">
          <DirectionIcon series="down" size={11} />
          <span className="num">{formatBytes(app.rxBytes)}</span>
        </span>
        <span className="app-row-figure">
          <DirectionIcon series="up" size={11} />
          <span className="num">{formatBytes(app.txBytes)}</span>
        </span>
      </div>
    </li>
  )
}

export default function AppUsageView({ usage, isLoading, error }: AppUsageViewProps): JSX.Element {
  const { apps, support, trackingSince } = usage
  const hasData = apps.length > 0
  const max = apps.reduce((m, app) => Math.max(m, app.rxBytes + app.txBytes), 0)

  const subtitle =
    isLoading && !hasData ? 'Loading…' : 'Network usage by application, busiest first'

  return (
    <div className="view-page">
      <ViewHeader
        icon={<AppsIcon size={18} />}
        title="Apps"
        subtitle={subtitle}
        subtitleShown={!(isLoading && !hasData)}
        actions={
          <UiTooltip content={APP_USAGE_INFO_HINT}>
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              aria-label="About per-app usage"
            >
              <HelpIcon size={16} />
            </button>
          </UiTooltip>
        }
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {support === 'unsupported' ? (
        <div className="view-empty">
          <p className="text-muted">Per-app usage isn’t available right now.</p>
          <p className="text-meta app-usage-note">
            On Windows, attributing bytes to a process uses a network event-tracing
            session that needs administrator rights — run Rove as administrator to
            enable per-app usage. It works without elevation on Linux and macOS.
          </p>
        </div>
      ) : isLoading && !hasData ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Measuring per-app usage…</p>
        </div>
      ) : !hasData ? (
        <div className="view-empty">
          <p className="text-muted">No app traffic seen yet.</p>
          <p className="text-meta app-usage-note">
            Usage appears here as your apps send and receive. Totals are gathered while Rove runs.
          </p>
        </div>
      ) : (
        <Section
          title="Since Rove started"
          icon={<AppsIcon size={15} />}
          action={
            trackingSince != null ? (
              <span className="text-meta">measuring {formatTimeAgo(trackingSince)}</span>
            ) : undefined
          }
        >
          <ul className="app-list">
            {apps.map((app) => (
              <AppRow key={app.name} app={app} max={max} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
