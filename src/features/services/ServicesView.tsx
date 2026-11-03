import { useMemo, useState } from 'react'

import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'
import { useNavigation } from '@/app/hooks/useNavigation'
import { AddServiceDialog } from '@/features/services/components/AddServiceDialog'
import { RowMenu, ServiceRow } from '@/features/services/components/ServiceRow'
import { serviceTally } from '@/features/services/components/ServiceTally'
import { useServiceLatency } from '@/features/services/hooks/useServiceLatency'
import { useServiceReachability } from '@/features/services/hooks/useServiceReachability'
import { useServices } from '@/features/services/hooks/useServices'
import type { InternetStatus, ServiceDefinition, ServiceReachability } from '@/types'
import {
  Banner,
  Button,
  CardList,
  CloudIcon,
  DialogRoot,
  DotSeparator,
  EmptyState,
  EventsIcon,
  HelpIcon,
  IconButton,
  Link,
  PageHeader,
  PlusIcon,
  Tooltip,
} from '@/ui'

const SERVICES_HINT =
  'Latency is a full HTTPS handshake, so it reads higher than a ping. A server error counts as down.'

/** What the add/edit dialog shows. `openCount` tells one opening from the next,
 *  so reopening while the last one leaves starts it fresh. */
type DialogState = ({ mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }) & { openCount: number }

function isInternetDown(status: InternetStatus | undefined): boolean {
  return status === 'noInternet' || status === 'offline'
}

/** There's nothing to probe against while offline, so adding is disabled until we're back. */
function AddServiceButton({ isOffline, onClick }: { isOffline: boolean; onClick: () => void }) {
  if (isOffline) {
    return (
      <Tooltip content="Connect to the internet first">
        <Button variant="solid" icon={PlusIcon} isDisabled>
          Add service
        </Button>
      </Tooltip>
    )
  }
  return (
    <Button variant="solid" icon={PlusIcon} onClick={onClick} aria-haspopup="dialog">
      Add service
    </Button>
  )
}

/**
 * The Services page: the tracked-service list, where a service is added (by
 * URL/IP) or edited/removed from a per-row menu, with a link to the outage
 * timeline in the subtitle. The list is owned by the backend store (see
 * `useServices`); latency is overlaid from the latest services probes so each
 * row shows how it's doing.
 */
export function ServicesView() {
  const { navigate } = useNavigation()
  const { report, run: reprobe } = useServiceReachability()
  const reachability = report?.services
  // Measured in the same batch as `reachability`. While it isn't online, a failed
  // probe means we couldn't check, so those rows read as unknown, not "Down".
  const internet = report?.internet
  // The title bar's live status, so the tally and Add button never disagree with
  // it between probe batches.
  const liveInternet = useConnectionStatus().internet
  // Re-probe the services so a just-added/removed service's latency refreshes.
  const refreshServices = (): void => {
    void reprobe()
  }
  const openTimeline = (): void => navigate({ tab: 'services', servicesSub: { view: 'timeline' } })
  const { services, error, add, update, remove } = useServices()
  const latencyHistory = useServiceLatency()

  const isInternetUnreachable = isInternetDown(internet)
  const isOfflineNow = isInternetDown(liveInternet)
  // Null until the first probes land, so the timeline link stands alone until then.
  const tally = serviceTally(reachability, liveInternet)
  // The dialog's content outlives its closing, so it can play its leave animation.
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const openDialog = (next: { mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }): void => {
    setDialog({ ...next, openCount: (dialog?.openCount ?? 0) + 1 })
    setIsDialogOpen(true)
  }
  // Latency captured by the dialog's test, keyed by host, so a freshly added or
  // edited row shows its measured value at once until the next services poll.
  const [seededLatency, setSeededLatency] = useState<Map<string, number | null>>(new Map())

  const probeByHost = useMemo(() => {
    const map = new Map<string, ServiceReachability>()
    for (const probe of reachability ?? []) map.set(probe.host, probe)
    return map
  }, [reachability])

  // Until the stored list loads, show the probed services so the page isn't blank.
  const listedServices: ServiceDefinition[] = services ?? (reachability ?? []).map(({ name, host }) => ({ name, host }))

  // Persist a confirmed add or edit. Re-adding the same host updates its label;
  // an edit keeps the row's place in the list, even when it changed the host.
  const saveService = (name: string, host: string, latencyMs: number | null | undefined): Promise<void> => {
    // A rename measured nothing, so the row keeps its live readout.
    if (latencyMs !== undefined) setSeededLatency((prev) => new Map(prev).set(host, latencyMs))
    const oldHost = dialog?.mode === 'edit' ? dialog.service.host : null
    const persist = oldHost ? update(oldHost, name, host) : add(name, host)
    return persist.then(refreshServices)
  }

  const removeService = (host: string): void => {
    void remove(host).then(refreshServices)
  }

  return (
    <div className="page">
      <PageHeader
        icon={<CloudIcon size={18} />}
        title="Services"
        // The up/down tally, then the timeline link. Wraps the link onto its own
        // line when the two can't share one, so a narrow window breaks between
        // them rather than inside either.
        description={
          <span className="inline-flex flex-wrap items-center gap-x-6 gap-y-4">
            {tally && (
              <>
                {tally}
                <DotSeparator />
              </>
            )}
            <Link icon={EventsIcon} onClick={openTimeline}>
              View timeline
            </Link>
          </span>
        }
        // Beside a full button the help chip takes the 10px step, as on Speed.
        actions={
          <div className="flex items-center gap-10">
            <IconButton label="About service checks" icon={HelpIcon} tooltip={SERVICES_HINT} />
            <AddServiceButton isOffline={isOfflineNow} onClick={() => openDialog({ mode: 'add' })} />
          </div>
        }
      />

      {error && <Banner variant="error" title={error} description="Your services are as they were." />}

      <DialogRoot isOpen={isDialogOpen}>
        {dialog && (
          <AddServiceDialog
            key={dialog.openCount}
            editing={dialog.mode === 'edit' ? { name: dialog.service.name, host: dialog.service.host } : undefined}
            onAdd={saveService}
            onClose={() => setIsDialogOpen(false)}
          />
        )}
      </DialogRoot>

      {listedServices.length > 0 ? (
        // Rows are separated by the same hairline the data cards use, running edge
        // to edge: the rows, not the list, carry the horizontal padding.
        <CardList label="Tracked services">
          {listedServices.map((svc) => (
            <ServiceRow
              key={svc.host}
              service={svc}
              probe={probeByHost.get(svc.host)}
              seededLatencyMs={seededLatency.get(svc.host)}
              samples={latencyHistory[svc.host] ?? []}
              isInternetUnreachable={isInternetUnreachable}
              menu={
                <RowMenu
                  service={svc}
                  onEdit={() => openDialog({ mode: 'edit', service: svc })}
                  onRemove={() => removeService(svc.host)}
                />
              }
            />
          ))}
        </CardList>
      ) : (
        <EmptyState title="No services yet" description="Add a site or server to watch its uptime." />
      )}
    </div>
  )
}
