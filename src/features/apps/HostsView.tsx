import { useNavigation } from '@/app/hooks/useNavigation'
import { AppGroup } from '@/features/apps/components/AppGroup'
import { UsageBody, type UsageBodyCopy } from '@/features/apps/components/UsageBody'
import { useExpandedApps } from '@/features/apps/hooks/useExpandedApps'
import { useHostUsage } from '@/features/apps/hooks/useHostUsage'
import { useScrollToFocusedApp } from '@/features/apps/hooks/useScrollToFocusedApp'
import { Banner, CardList, HelpIcon, IconButton, PageHeader } from '@/ui'
import { POLLING_DESCRIPTION } from '@/utils/copy'

const HOST_USAGE_INFO_HINT =
  'Hosts each app connected to, named by reverse DNS. Bytes cover TCP only and reset when Rove restarts.'

const BODY_COPY: UsageBodyCopy = {
  unsupported: 'Run Rove as administrator to attribute hosts to apps on Windows.',
  loading: 'Measuring per-app hosts…',
  emptyTitle: 'No hosts yet',
  empty: 'Hosts appear here as your apps connect.',
}

export function HostsView() {
  const { usage, isFirstLoad, error, reload } = useHostUsage()
  const { location, back } = useNavigation()
  const { apps } = usage
  // Arriving from an app opens only its group; otherwise all start collapsed.
  const focusApp = location.appsSub?.view === 'hosts' ? (location.appsSub.app ?? null) : null
  const { isExpanded, toggle } = useExpandedApps(focusApp)
  const listRef = useScrollToFocusedApp(focusApp, apps)

  return (
    <div className="page">
      <PageHeader
        title="Hosts"
        description="Remote hosts by application, busiest first"
        status={isFirstLoad ? 'Loading…' : undefined}
        onBack={back}
        actions={<IconButton label="About per-app hosts" icon={HelpIcon} tooltip={HOST_USAGE_INFO_HINT} />}
      />
      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <UsageBody support={usage.support} isFirstLoad={isFirstLoad} isEmpty={apps.length === 0} copy={BODY_COPY}>
        <CardList label="Apps" ref={listRef}>
          {apps.map((app) => (
            <AppGroup key={app.name} app={app} isExpanded={isExpanded(app.name)} onToggle={toggle} />
          ))}
        </CardList>
      </UsageBody>
    </div>
  )
}
