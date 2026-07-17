import type { AppUsage, AppUsageSummary } from '@/types'
import { formatBytes } from '@/lib/format'
import { appDomain } from '@/lib/appDomain'
import { Tooltip as UiTooltip } from '@/components/ui/Tooltip'
import { ViewHeader } from '@/components/ui/ViewHeader'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { MetricValue } from '@/components/ui/MetricValue'
import { AppsIcon, ChevronRightIcon, GlobeIcon, HelpIcon, InfoIcon, LayersIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { EmptyState } from '@/components/ui/EmptyState'
import { RestartAsAdminAction } from '@/components/ui/RestartAsAdminAction'
import { DotSeparator } from '@/components/ui/DotSeparator'
import { Spinner } from '@/components/ui/Spinner'
import './AppUsageView.css'

const APP_USAGE_INFO_HINT =
  'Bytes are attributed to the app that moved them, read from the OS per-process ' +
  'network counters while Rove is running. Totals reset when Rove restarts.'

const APP_USAGE_EMPTY_HINT = 'Usage appears here as your apps send and receive.'

const APP_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to meter per-app usage on Windows.'

interface AppUsageViewProps {
  readonly usage: AppUsageSummary
  readonly isLoading: boolean
  readonly error?: string | null
  /** Open the per-app remote-host breakdown (the Hosts subpage). */
  readonly onViewHosts: () => void
  /** Open the by-protocol breakdown (the Traffic Types subpage). */
  readonly onViewTraffic: () => void
  /** Open the Hosts subpage focused on a single app (that group expanded, the
   *  rest collapsed). Fired by clicking an app row. */
  readonly onOpenApp: (name: string) => void
}

/** One app's row, styled like a Services row: icon + name on the left, total on
 *  the right, then a proportional down/up bar and the byte figures beneath. The
 *  whole row is a link into that app's hosts — a transparent overlay button
 *  covers it (so the block content needn't nest inside a button) and a caret on
 *  the right signals it's navigable. */
function AppRow({
  app,
  max,
  onOpen,
}: {
  readonly app: AppUsage
  readonly max: number
  readonly onOpen: () => void
}): JSX.Element {
  const total = app.rxBytes + app.txBytes
  // Split the bar into down/up segments, each scaled against the busiest app so
  // the rows are comparable at a glance. Guard the divide for the all-zero case.
  const scale = max > 0 ? 100 / max : 0
  const downPct = app.rxBytes * scale
  const upPct = app.txBytes * scale
  return (
    <div className="app-row">
      <button
        type="button"
        className="app-row-toggle"
        onClick={onOpen}
        aria-label={`View hosts for ${app.name}`}
      />
      <div className="app-row-main">
        <span className="app-row-id">
          <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
          <span className="app-row-name" title={app.name}>
            {app.name}
          </span>
        </span>
        <span className="app-row-end">
          <MetricValue value={total} level="app-row-total num" format={formatBytes} />
          <ChevronRightIcon size={16} className="app-row-caret" aria-hidden />
        </span>
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
          <MetricValue value={app.rxBytes} level="num" format={formatBytes} />
        </span>
        <span className="app-row-figure">
          <DirectionIcon series="up" size={11} />
          <MetricValue value={app.txBytes} level="num" format={formatBytes} />
        </span>
      </div>
    </div>
  )
}

export default function AppUsageView({
  usage,
  isLoading,
  error,
  onViewHosts,
  onViewTraffic,
  onOpenApp,
}: AppUsageViewProps): JSX.Element {
  const { apps, support } = usage
  const hasData = apps.length > 0
  const max = apps.reduce((m, app) => Math.max(m, app.rxBytes + app.txBytes), 0)

  // Once there's data, the subtitle doubles as the link into the per-app host
  // breakdown (mirrors the Services view's "View timeline" link); before then it
  // stays a plain status line.
  const subtitle =
    isLoading && !hasData ? (
      'Loading…'
    ) : (
      <span className="app-subtitle-links">
        <button type="button" className="app-hosts-link" onClick={onViewHosts}>
          <GlobeIcon size={13} />
          <span className="app-hosts-link-text">All hosts</span>
        </button>
        <DotSeparator />
        <button type="button" className="app-hosts-link" onClick={onViewTraffic}>
          <LayersIcon size={13} />
          <span className="app-hosts-link-text">All traffic types</span>
        </button>
      </span>
    )

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
        <EmptyState
          icon={InfoIcon}
          title="Administrator access needed"
          hint={APP_USAGE_UNSUPPORTED_HINT}
          action={<RestartAsAdminAction />}
        />
      ) : isLoading && !hasData ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Measuring per-app usage…</p>
        </div>
      ) : !hasData ? (
        <EmptyState icon={AppsIcon} title="No app usage yet" hint={APP_USAGE_EMPTY_HINT} />
      ) : (
        <div className="ui-section">
          <div className="ui-section-body app-list">
            {apps.map((app) => (
              <AppRow key={app.name} app={app} max={max} onOpen={() => onOpenApp(app.name)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
