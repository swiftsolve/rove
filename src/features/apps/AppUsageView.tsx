import type { AppUsage, AppUsageSummary } from '@/types'
import { useAppUsage } from '@/features/apps/hooks/useAppUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { appDomain } from '@/features/apps/utils/app-domain'
import { busiestTotal, percentOf, totalBytes, transferLabel } from '@/features/apps/utils/transfer'
import {
  AppsIcon,
  Button,
  ChevronRightIcon,
  DotSeparator,
  EmptyState,
  ErrorBanner,
  GlobeIcon,
  HelpIcon,
  IconButton,
  LayersIcon,
  LoadingState,
  PageHeader,
  POLLING_DESCRIPTION,
} from '@/ui'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { RestartAsAdminAction } from '@/features/apps/components/RestartAsAdminAction'
import { cva, cx } from 'class-variance-authority'
import { UsageList } from '@/features/apps/components/UsageList'
import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { TransferFigures } from '@/features/apps/components/TransferFigures'

/** One segment of a row's down/up bar, coloured by its series. Its width eases
 *  as the totals (and the busiest-app scale) change, so the bars glide in step
 *  with the count-up figures; the global reduced-motion rule neutralises it. */
const segVariants = cva('h-full transition-[width] duration-400 ease-out', {
  variants: {
    series: { down: 'bg-series-down', up: 'bg-series-up' },
  },
})

// A row runs edge to edge in the card and owns the horizontal inset, so the
// hairlines between rows (on the list) span the full width. Every row carries
// equal top and bottom padding, so the first and last aren't special-cased.
// Hover gets the Speed page's capability-row wash.
const ROW = cx(
  'group/row relative flex flex-col gap-8 px-(--card-body-padding) py-12',
  'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-faint',
)

// The whole row links into that app's hosts: a transparent overlay button
// covers it, so the block content needn't nest inside a button, and being
// absolutely positioned it paints above the static content to catch the click.
// Its focus ring sits just inside the row (rows run edge to edge), square except
// where the first and last rows meet the card's rounded corners.
const ROW_LINK = cx(
  'absolute inset-0 w-full focus-visible:outline-offset-(--focus-inset)',
  'group-first/row:rounded-t-lg group-last/row:rounded-b-lg',
)

const APP_USAGE_INFO_HINT =
  'Bytes per app from the OS’s per-process counters. Resets when Rove restarts.'

const APP_USAGE_EMPTY_HINT = 'Apps appear here as they use the network.'

const APP_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to meter per-app usage on Windows.'

/** One app's row, styled like a Services row: icon + name on the left, total on
 *  the right, then a proportional down/up bar and the byte figures beneath. The
 *  whole row is a link into that app's hosts — a transparent overlay button
 *  covers it (so the block content needn't nest inside a button) and a caret on
 *  the right signals it's navigable. */
function AppRow({
  app,
  busiest,
  onOpen,
}: {
  app: AppUsage
  busiest: number
  onOpen: () => void
}): JSX.Element {
  const total = totalBytes(app)
  // Split the bar into down/up segments, each scaled against the busiest app so
  // the rows are comparable at a glance.
  const downPct = percentOf(app.rxBytes, busiest)
  const upPct = percentOf(app.txBytes, busiest)
  return (
    <li className={ROW}>
      <button
        type="button"
        className={ROW_LINK}
        onClick={onOpen}
        aria-label={`View hosts for ${app.name}`}
      />
      {/* The visual layers are click-through, so the overlay button owns all
          pointer interaction (cursor and click), the caret included. */}
      <div className="pointer-events-none flex items-center justify-between gap-12">
        <span className="inline-flex min-w-0 items-center gap-8">
          <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
          {/* Long process paths (e.g. macOS bundle identifiers) truncate rather
              than wrap, keeping the main line one row tall. */}
          <span className="truncate text-sm text-primary" title={app.name}>
            {app.name}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-8">
          <ByteTotal bytes={total} />
          <ChevronRightIcon
            size={16}
            className={cx(
              'text-tertiary opacity-35 transition-opacity duration-(--duration-fast) ease-in-out',
              'group-hover/row:opacity-75',
            )}
            aria-hidden
          />
        </span>
      </div>
      {/* One track, two segments side by side, each scaled against the busiest
          app so rows read comparably; an empty segment collapses to zero width.
          Starts flush with the app icon's left edge. */}
      <div
        className="pointer-events-none flex h-[3px] overflow-hidden rounded-xs bg-inset"
        role="img"
        aria-label={transferLabel(app)}
      >
        <span className={segVariants({ series: 'down' })} style={{ width: `${downPct}%` }} />
        <span className={segVariants({ series: 'up' })} style={{ width: `${upPct}%` }} />
      </div>
      {/* The bar's label above already reads these figures out. Pulled left by
          the arrow glyph's side bearing (~2px at 11px) so the drawn arrow lines
          up with the app icon's and bar's left edge. */}
      <TransferFigures transfer={app} isDecorative className="pointer-events-none -ml-2" />
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
    <span className="inline-flex items-center gap-6">
      <Button variant="link" icon={GlobeIcon} iconEnd={ChevronRightIcon} onClick={onViewHosts}>
        All hosts
      </Button>
      <DotSeparator />
      <Button variant="link" icon={LayersIcon} iconEnd={ChevronRightIcon} onClick={onViewTraffic}>
        All traffic types
      </Button>
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
        isLocked
        title="Administrator access needed"
        description={APP_USAGE_UNSUPPORTED_HINT}
        actions={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return (
      <LoadingState label="Measuring per-app usage…" />
    )
  }
  if (apps.length === 0) {
    return <EmptyState title="No app usage yet" description={APP_USAGE_EMPTY_HINT} />
  }

  const busiest = busiestTotal(apps)
  return (
    <UsageList label="Apps by usage">
      {apps.map((app) => (
        <AppRow
          key={app.name}
          app={app}
          busiest={busiest}
          onOpen={() => navigate({ tab: 'apps', appsSub: { view: 'hosts', app: app.name } })}
        />
      ))}
    </UsageList>
  )
}

export function AppUsageView(): JSX.Element {
  const { usage, isFirstLoad, error, reload } = useAppUsage()

  return (
    <div className="page">
      <PageHeader
        icon={<AppsIcon size={18} />}
        title="Apps"
        description={<AppSubtitleLinks />}
        status={isFirstLoad ? 'Loading…' : undefined}
        actions={
          <IconButton label="About per-app usage" icon={HelpIcon} tooltip={APP_USAGE_INFO_HINT} />
        }
      />

      {error && <ErrorBanner title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <AppUsageBody usage={usage} isFirstLoad={isFirstLoad} />
    </div>
  )
}
