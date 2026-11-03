import { useNavigation } from '@/app/hooks/useNavigation'
import { AppIcon } from '@/features/apps/components/AppIcon'
import { UsageBody, type UsageBodyCopy } from '@/features/apps/components/UsageBody'
import { UsageRow } from '@/features/apps/components/UsageRow'
import { useAppUsage } from '@/features/apps/hooks/useAppUsage'
import { busiestTotal } from '@/features/apps/utils/transfer'
import {
  AppsIcon,
  Banner,
  CardList,
  DotSeparator,
  GlobeIcon,
  HelpIcon,
  IconButton,
  LayersIcon,
  Link,
  PageHeader,
} from '@/ui'
import { POLLING_DESCRIPTION } from '@/utils/copy'

const APP_USAGE_INFO_HINT = 'Bytes per app from the OS’s per-process counters. Resets when Rove restarts.'

const BODY_COPY: UsageBodyCopy = {
  unsupported: 'Run Rove as administrator to meter per-app usage on Windows.',
  loading: 'Measuring per-app usage…',
  emptyTitle: 'No app usage yet',
  empty: 'Apps appear here as they use the network.',
}

/** The header subtitle: links into the per-app host and by-protocol breakdowns. */
function AppSubtitleLinks() {
  const { navigate } = useNavigation()
  const onViewHosts = (): void => navigate({ tab: 'apps', appsSub: { view: 'hosts' } })
  const onViewTraffic = (): void => navigate({ tab: 'apps', appsSub: { view: 'traffic' } })
  return (
    <span className="inline-flex items-center gap-6">
      <Link icon={GlobeIcon} onClick={onViewHosts}>
        All hosts
      </Link>
      <DotSeparator />
      <Link icon={LayersIcon} onClick={onViewTraffic}>
        All traffic types
      </Link>
    </span>
  )
}

export function AppUsageView() {
  const { usage, isFirstLoad, error, reload } = useAppUsage()
  const { navigate } = useNavigation()
  const { apps } = usage
  const busiest = busiestTotal(apps)

  return (
    <div className="page">
      <PageHeader
        icon={<AppsIcon size={18} />}
        title="Apps"
        description={<AppSubtitleLinks />}
        status={isFirstLoad ? 'Loading…' : undefined}
        actions={<IconButton label="About per-app usage" icon={HelpIcon} tooltip={APP_USAGE_INFO_HINT} />}
      />

      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <UsageBody support={usage.support} isFirstLoad={isFirstLoad} isEmpty={apps.length === 0} copy={BODY_COPY}>
        <CardList label="Apps by usage">
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
        </CardList>
      </UsageBody>
    </div>
  )
}
