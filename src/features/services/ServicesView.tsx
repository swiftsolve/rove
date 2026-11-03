import { cx } from 'class-variance-authority'
import { type ReactNode, useMemo, useState } from 'react'

import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'
import { useNavigation } from '@/app/hooks/useNavigation'
import { AddServiceDialog } from '@/features/services/components/AddServiceDialog'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { serviceTally } from '@/features/services/components/ServiceTally'
import { Sparkline } from '@/features/services/components/Sparkline'
import { useServiceLatency } from '@/features/services/hooks/useServiceLatency'
import { useServiceReachability } from '@/features/services/hooks/useServiceReachability'
import { useServices } from '@/features/services/hooks/useServices'
import { type LatencySample, MAX_SAMPLES } from '@/features/services/utils/service-latency'
import { isHttpErroring, latencyBand } from '@/features/services/utils/service-status'
import { formatLatencyMs } from '@/lib/format'
import type { InternetStatus, ServiceDefinition, ServiceReachability } from '@/types'
import {
  Button,
  CardList,
  CloudIcon,
  DialogRoot,
  DotSeparator,
  EditIcon,
  EmptyState,
  EventsIcon,
  HelpIcon,
  IconButton,
  Link,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  MetricValue,
  PageHeader,
  PlusIcon,
  Tooltip,
  TrashIcon,
} from '@/ui'

const SERVICES_HINT =
  'Latency is a full HTTPS handshake, so it reads higher than a ping. A server error counts as down.'

// With a hover-capable pointer the kebab stays collapsed until its row is hovered,
// it has focus or its menu is open. Touch can't hover, so it always shows there.
const KEBAB_REVEAL = cx(
  'transition-[width,opacity,color,background] duration-(--duration-fast) ease-in-out',
  '[@media(hover:hover)]:w-0 [@media(hover:hover)]:overflow-hidden [@media(hover:hover)]:opacity-0',
  'group-hover/row:w-[30px] group-hover/row:opacity-100',
  'focus-visible:w-[30px] focus-visible:opacity-100',
  'data-popup-open:w-[30px] data-popup-open:opacity-100',
)

// One line of a row's body: left-hand text that ellipsises, right-hand value
// that holds its width.
const LINE = 'flex min-w-0 items-center gap-12'

/** What the add/edit dialog shows. `openCount` tells one opening from the next,
 *  so reopening while the last one leaves starts it fresh. */
type DialogState = ({ mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }) & { openCount: number }

function isInternetDown(status: InternetStatus | undefined): boolean {
  return status === 'noInternet' || status === 'offline'
}

type RowMenuProps = {
  service: ServiceDefinition
  onEdit: () => void
  onRemove: () => void
}

/** The per-row overflow menu: a kebab that opens Edit and Remove. */
function RowMenu({ service, onEdit, onRemove }: RowMenuProps) {
  return (
    <Menu>
      <MenuTrigger label={`Options for ${service.name}`} className={KEBAB_REVEAL} />
      <MenuContent>
        <MenuItem icon={EditIcon} onClick={onEdit}>
          Edit
        </MenuItem>
        <MenuItem icon={TrashIcon} tone="negative" onClick={onRemove}>
          Remove
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** A glyph standing in for a latency ("…", "—"), read aloud as a word instead. */
function PlaceholderReadout({ glyph, spoken }: { glyph: string; spoken: string }) {
  return (
    <span className="type-body-small text-tertiary">
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}

/**
 * A row's latency readout. `latencyMs` is undefined while nothing has been
 * measured yet, and null when the probe's network path failed.
 */
function LatencyReadout({
  latencyMs,
  isErroring,
  isInternetUnreachable,
}: {
  latencyMs: number | null | undefined
  isErroring: boolean
  isInternetUnreachable: boolean
}) {
  if (latencyMs === undefined) return <PlaceholderReadout glyph="…" spoken="Measuring" />
  if (latencyMs === null) {
    // Path failed. Only a genuine "Down" when we know the internet is up;
    // otherwise the failure is ours, so read it as unknown.
    return isInternetUnreachable ? (
      <PlaceholderReadout glyph="—" spoken="Unknown" />
    ) : (
      <span className="text-negative">Down</span>
    )
  }
  if (isErroring) return <span className="text-negative">Down</span>
  return <MetricValue value={latencyMs} status={latencyBand(latencyMs)} format={formatLatencyMs} />
}

type ServiceRowProps = {
  service: ServiceDefinition
  /** This host's entry in the latest probe batch, if it has one yet. */
  probe: ServiceReachability | undefined
  /** The latency the add/edit dialog measured, shown until a probe lands. */
  seededLatencyMs: number | null | undefined
  samples: LatencySample[]
  isInternetUnreachable: boolean
  /** The row's overflow menu, built by the view (which owns the menu state). */
  menu: ReactNode
}

function ServiceRow({ service, probe, seededLatencyMs, samples, isInternetUnreachable, menu }: ServiceRowProps) {
  const latencyMs = probe ? probe.latencyMs : seededLatencyMs
  const isErroring = probe ? isHttpErroring(probe.httpStatus) : false
  // Matches LatencyReadout's "Down": an erroring host, or a failed path while
  // the internet is up. A down row's sparkline is a flat red line.
  const isDown = probe ? isErroring || (probe.latencyMs === null && !isInternetUnreachable) : false

  return (
    // Less right padding than left so the kebab sits closer to the card edge: its
    // 30px hit area already carries visual breathing room around the dots.
    <li className="group/row flex items-center gap-8 py-12 pr-6 pl-16">
      {/* Takes the row's free width so both lines can ellipsise their left-hand text. */}
      <div className="flex min-w-0 flex-auto flex-col gap-2">
        <div className={LINE}>
          <ServiceIcon host={service.host} name={service.name} />
          <span className="min-w-0 flex-auto truncate text-primary">{service.name}</span>
          {(samples.length > 0 || isDown) && (
            <Sparkline
              samples={samples}
              slots={MAX_SAMPLES}
              isDown={isDown}
              width={64}
              height={20}
              label={service.name}
            />
          )}
        </div>
        {/* Indent the URL line so it starts under the name, clearing the favicon
            (16px) and its gap that lead the line above. */}
        <div className={cx(LINE, 'min-h-[1.25em] pl-[calc(16px+var(--spacing-12))]')}>
          <span className="min-w-0 flex-auto truncate text-sm text-tertiary">{service.host}</span>
          {/* A steady min-width so the URL's ellipsis to its left doesn't shift as
              the animated latency number changes width poll to poll. */}
          <span className="num min-w-[4.5em] shrink-0 text-right font-numeric text-sm text-secondary">
            <LatencyReadout
              latencyMs={latencyMs}
              isErroring={isErroring}
              isInternetUnreachable={isInternetUnreachable}
            />
          </span>
        </div>
      </div>
      {menu}
    </li>
  )
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
  const { services, add, update, remove } = useServices()
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
