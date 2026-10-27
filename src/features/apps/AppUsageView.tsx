import type { AppUsage, AppUsageSummary } from '@/types'
import { formatBytes } from '@/lib/format'
import { useAppData } from '@/app/hooks/useAppData'
import { useNavigation } from '@/app/hooks/useNavigation'
import { appDomain } from '@/features/apps/utils/app-domain'
import { Tooltip as UiTooltip } from '@/components/Tooltip'
import { ViewHeader } from '@/components/ViewHeader'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { MetricValue } from '@/components/MetricValue'
import { AppsIcon, ChevronRightIcon, GlobeIcon, HelpIcon, InfoIcon, LayersIcon } from '@/components/icons/Icons'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import { EmptyState } from '@/components/EmptyState'
import { RestartAsAdminAction } from '@/components/RestartAsAdminAction'
import { DotSeparator } from '@/components/DotSeparator'
import { Spinner } from '@/components/Spinner'
import { cva, cx } from 'class-variance-authority'
import { IconButton } from '@/components/IconButton'
import styles from './AppUsageView.module.css'

/** One segment of a row's down/up bar, coloured by its series. */
const segVariants = cva(styles.seg, {
  variants: {
    series: { down: styles.seriesDown, up: styles.seriesUp },
  },
})

const APP_USAGE_INFO_HINT =
  'Bytes are attributed to the app that moved them, read from the OS per-process ' +
  'network counters while Rove is running. Totals reset when Rove restarts.'

const APP_USAGE_EMPTY_HINT = 'Usage appears here as your apps send and receive.'

const APP_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to meter per-app usage on Windows.'

/** One app's row, styled like a Services row: icon + name on the left, total on
 *  the right, then a proportional down/up bar and the byte figures beneath. The
 *  whole row is a link into that app's hosts — a transparent overlay button
 *  covers it (so the block content needn't nest inside a button) and a caret on
 *  the right signals it's navigable. */
function AppRow({
  app,
  busiestTotal,
  onOpen,
}: {
  app: AppUsage
  busiestTotal: number
  onOpen: () => void
}): JSX.Element {
  const total = app.rxBytes + app.txBytes
  // Split the bar into down/up segments, each scaled against the busiest app so
  // the rows are comparable at a glance. Guard the divide for the all-zero case.
  const scale = busiestTotal > 0 ? 100 / busiestTotal : 0
  const downPct = app.rxBytes * scale
  const upPct = app.txBytes * scale
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.toggle}
        onClick={onOpen}
        aria-label={`View hosts for ${app.name}`}
      />
      <div className={styles.main}>
        <span className={styles.id}>
          <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
          <span className={styles.name} title={app.name}>
            {app.name}
          </span>
        </span>
        <span className={styles.end}>
          <MetricValue value={total} className={cx(styles.total, 'num')} format={formatBytes} />
          <ChevronRightIcon size={16} className={styles.caret} aria-hidden />
        </span>
      </div>
      <div
        className={styles.bar}
        role="img"
        aria-label={`${formatBytes(app.rxBytes)} down, ${formatBytes(app.txBytes)} up`}
      >
        <span className={segVariants({ series: 'down' })} style={{ width: `${downPct}%` }} />
        <span className={segVariants({ series: 'up' })} style={{ width: `${upPct}%` }} />
      </div>
      {/* The bar's label above already reads these figures out. */}
      <div className={styles.figures} aria-hidden>
        <span className={styles.figure}>
          <DirectionIcon series="down" size={11} />
          <MetricValue value={app.rxBytes} className="num" format={formatBytes} />
        </span>
        <span className={styles.figure}>
          <DirectionIcon series="up" size={11} />
          <MetricValue value={app.txBytes} className="num" format={formatBytes} />
        </span>
      </div>
    </li>
  )
}

/** The header subtitle once there's data: links into the per-app host breakdown
 *  and the by-protocol breakdown (mirrors the Services view's "View timeline"
 *  link). */
function AppSubtitleLinks(): JSX.Element {
  const { navigate } = useNavigation()
  const onViewHosts = (): void => navigate({ tab: 'apps', appsSub: { view: 'hosts' } })
  const onViewTraffic = (): void => navigate({ tab: 'apps', appsSub: { view: 'traffic' } })
  return (
    <span className={styles.subtitleLinks}>
      <button type="button" className={styles.link} onClick={onViewHosts}>
        <GlobeIcon size={13} />
        <span className={styles.linkText}>All hosts</span>
        <ChevronRightIcon size={13} className="link-caret" />
      </button>
      <DotSeparator />
      <button type="button" className={styles.link} onClick={onViewTraffic}>
        <LayersIcon size={13} />
        <span className={styles.linkText}>All traffic types</span>
        <ChevronRightIcon size={13} className="link-caret" />
      </button>
    </span>
  )
}

/** The page body: the admin prompt, a first-load spinner, an empty state, or
 *  the app list. */
function AppUsageBody({
  usage,
  isFirstLoad,
}: {
  usage: AppUsageSummary
  isFirstLoad: boolean
}): JSX.Element {
  const { navigate } = useNavigation()
  const { apps, support } = usage
  if (support === 'unsupported') {
    return (
      <EmptyState
        icon={InfoIcon}
        title="Administrator access needed"
        hint={APP_USAGE_UNSUPPORTED_HINT}
        action={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return (
      <div className="view-empty" role="status">
        <Spinner />
        <p className="text-muted">Measuring per-app usage…</p>
      </div>
    )
  }
  if (apps.length === 0) {
    return <EmptyState icon={AppsIcon} title="No app usage yet" hint={APP_USAGE_EMPTY_HINT} />
  }

  const busiestTotal = apps.reduce((max, app) => Math.max(max, app.rxBytes + app.txBytes), 0)
  return (
    <div className="ui-section">
      <ul role="list" aria-label="Apps by usage" className={cx('ui-section-body', styles.list)}>
        {apps.map((app) => (
          <AppRow
            key={app.name}
            app={app}
            busiestTotal={busiestTotal}
            onOpen={() => navigate({ tab: 'apps', appsSub: { view: 'hosts', app: app.name } })}
          />
        ))}
      </ul>
    </div>
  )
}

export function AppUsageView(): JSX.Element {
  const { usage, isLoading, error } = useAppData().screens.appUsage
  const isFirstLoad = isLoading && usage.apps.length === 0

  return (
    <div className="view-page">
      <ViewHeader
        icon={<AppsIcon size={18} />}
        title="Apps"
        subtitle={
          isFirstLoad ? (
            'Loading…'
          ) : (
            <AppSubtitleLinks />
          )
        }
        isSubtitleShown={!isFirstLoad}
        actions={
          <UiTooltip content={APP_USAGE_INFO_HINT}>
            <IconButton
              aria-label="About per-app usage"
            >
              <HelpIcon size={16} />
            </IconButton>
          </UiTooltip>
        }
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <AppUsageBody usage={usage} isFirstLoad={isFirstLoad} />
    </div>
  )
}
