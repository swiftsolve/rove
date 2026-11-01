import type { AppUsageSummary } from '@/types'
import { useAppUsage } from '@/features/apps/hooks/useAppUsage'
import { useNavigation } from '@/app/hooks/useNavigation'
import { busiestTotal } from '@/features/apps/utils/transfer'
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
import { RestartAsAdminAction } from '@/features/apps/components/RestartAsAdminAction'
import { UsageList } from '@/features/apps/components/UsageList'
import { AppIcon } from '@/features/apps/components/AppIcon'
import { UsageRow } from '@/features/apps/components/UsageRow'

const APP_USAGE_INFO_HINT =
  'Bytes per app from the OS’s per-process counters. Resets when Rove restarts.'

const APP_USAGE_EMPTY_HINT = 'Apps appear here as they use the network.'

const APP_USAGE_UNSUPPORTED_HINT =
  'Run Rove as administrator to meter per-app usage on Windows.'

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
      {/* Each row links into that app's hosts. */}
      {apps.map((app) => (
        <UsageRow
          key={app.name}
          icon={<AppIcon app={app} />}
          iconKind="tile"
          name={app.name}
          transfer={app}
          busiest={busiest}
          link={{
            label: `View hosts for ${app.name}`,
            onOpen: () => navigate({ tab: 'apps', appsSub: { view: 'hosts', app: app.name } }),
          }}
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
