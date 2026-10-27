import { useMemo, useState, type ReactNode } from 'react'
import type { InternetStatus, ServiceDefinition, ServiceReachability } from '@/types'
import { ViewHeader } from '@/components/ViewHeader'
import { MetricValue } from '@/components/MetricValue'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { ChevronRightIcon, CloudIcon, EditIcon, EventsIcon, MoreVerticalIcon, PlusIcon, TrashIcon } from '@/components/icons/Icons'
import { EmptyState } from '@/components/EmptyState'
import { Tooltip } from '@/components/Tooltip'
import { DotSeparator } from '@/components/DotSeparator'
import { serviceTally } from '@/features/services/components/ServiceTally'
import { MAX_SAMPLES, type LatencySample } from '@/features/services/utils/service-latency'
import { isHttpErroring, latencyBand } from '@/features/services/utils/service-status'
import { Sparkline } from '@/features/services/components/Sparkline'
import { useServices } from '@/features/services/hooks/useServices'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useAppData } from '@/app/hooks/useAppData'
import { useServiceLatency } from '@/features/services/hooks/useServiceLatency'
import { AddServiceDialog } from '@/features/services/components/AddServiceDialog'
import { formatLatencyMs } from '@/lib/format'
import { Button } from '@/components/Button'
import { cva, cx } from 'class-variance-authority'
import { useMenu } from '@/hooks/useMenu'
import styles from './ServicesView.module.css'

const menuItemVariants = cva(styles.menuItem, {
  variants: {
    /** Destructive (Remove): red text and a red-tinted hover. */
    isDanger: { true: styles.isDanger },
  },
})

type DialogState = { mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }

function isInternetDown(status: InternetStatus | undefined): boolean {
  return status === 'noInternet' || status === 'offline'
}

interface RowMenuProps {
  service: ServiceDefinition
  isOpen: boolean
  onOpenChange: (host: string | null) => void
  onEdit: () => void
  onRemove: () => void
}

/** The per-row overflow menu: a kebab that opens a dropdown with Edit and Remove.
 *  Keyboard and focus behaviour come from `useMenu`. Only one is open at a time
 *  (the parent owns which host's menu is open). */
function RowMenu({ service, isOpen, onOpenChange, onEdit, onRemove }: RowMenuProps): JSX.Element {
  const { rootRef, triggerProps, menuProps } = useMenu(isOpen, () => onOpenChange(null))

  return (
    <div className={styles.menu} ref={rootRef}>
      <button
        type="button"
        className={styles.kebab}
        {...triggerProps}
        aria-label={`Options for ${service.name}`}
        onClick={() => onOpenChange(isOpen ? null : service.host)}
      >
        <MoreVerticalIcon size={16} />
      </button>
      {isOpen && (
        <div className={styles.dropdown} {...menuProps}>
          <button type="button" role="menuitem" tabIndex={-1} className={menuItemVariants()} onClick={onEdit}>
            <EditIcon size={14} />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={menuItemVariants({ isDanger: true })}
            onClick={onRemove}
          >
            <TrashIcon size={14} />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

/** A glyph standing in for a latency ("…", "—"), read aloud as a word instead. */
function PlaceholderReadout({ glyph, spoken }: { glyph: string; spoken: string }): JSX.Element {
  return (
    <span className="text-small">
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
}): JSX.Element {
  if (latencyMs === undefined) return <PlaceholderReadout glyph="…" spoken="Measuring" />
  if (latencyMs === null) {
    // Path failed. Only a genuine "Down" when we know the internet is up;
    // otherwise the failure is ours, so read it as unknown.
    return isInternetUnreachable ? (
      <PlaceholderReadout glyph="—" spoken="Unknown" />
    ) : (
      <span className="val-bad">Down</span>
    )
  }
  if (isErroring) return <span className="val-bad">Down</span>
  return <MetricValue value={latencyMs} level={latencyBand(latencyMs)} format={formatLatencyMs} />
}

interface ServiceRowProps {
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

function ServiceRow({
  service,
  probe,
  seededLatencyMs,
  samples,
  isInternetUnreachable,
  menu,
}: ServiceRowProps): JSX.Element {
  const latencyMs = probe ? probe.latencyMs : seededLatencyMs
  const isErroring = probe ? isHttpErroring(probe.httpStatus) : false
  // Down the same way the status reads it: a failed path (only when the
  // internet is up, else it's our fault) or a reachable-but-erroring host. A
  // down row's sparkline is a flat red line, not its old trend.
  const isDown = probe
    ? isErroring || (probe.latencyMs === null && !isInternetUnreachable)
    : false

  return (
    <li className={styles.row}>
      <div className={styles.body}>
        <div className={styles.line}>
          <ServiceIcon host={service.host} name={service.name} />
          <span className={styles.name}>{service.name}</span>
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
        <div className={cx(styles.line, styles.lineSub)}>
          <span className={styles.host}>{service.host}</span>
          <span className={cx(styles.status, 'num')}>
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
function AddServiceButton({ isOffline, onClick }: { isOffline: boolean; onClick: () => void }): JSX.Element {
  if (isOffline) {
    return (
      <Tooltip content="Connect to the internet first">
        <Button variant="filled" isDisabled>
          <PlusIcon size={14} />
          Add service
        </Button>
      </Tooltip>
    )
  }
  return (
    <Button variant="filled" onClick={onClick} aria-haspopup="dialog">
      <PlusIcon size={14} />
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
export function ServicesView(): JSX.Element {
  const { navigate } = useNavigation()
  const { screens, connection } = useAppData()
  // The latest reachability probes; latency is matched to rows by host.
  const reachability = screens.services.report?.services
  // The internet reachability measured alongside `reachability` (same probe
  // batch). When it isn't `online`, a probe in that batch that failed means "we
  // couldn't check", not "the service is down", so those rows read as unknown
  // ("—") rather than "Down".
  const internet = screens.services.report?.internet
  // The app's live internet status — the same one the title bar shows. Drives
  // the header ("No internet") and gates the Add button, so the page never
  // disagrees with the title bar between probe batches.
  const liveInternet = connection.internet
  // Re-probe the services so a just-added/removed service's latency refreshes.
  const refreshServices = (): void => {
    void screens.services.run()
  }
  const openTimeline = (): void => navigate({ tab: 'services', servicesSub: { view: 'timeline' } })
  const { services, add, remove } = useServices(true)
  // Rolling per-host latency history for each row's trend sparkline, appended
  // on each services poll (see `useServiceReachability`).
  const latencyHistory = useServiceLatency()

  // With the internet unreachable when this batch ran, a failed probe is our
  // fault, not the service's — so read those rows as unknown.
  const isInternetUnreachable = isInternetDown(internet)
  const isOfflineNow = isInternetDown(liveInternet)
  // The same live up/down count the timeline header shows, ahead of the timeline
  // link. Null until the first probes land, so the link stands alone until then.
  const tally = serviceTally(reachability, liveInternet)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [openMenuHost, setOpenMenuHost] = useState<string | null>(null)
  // Latency captured by the dialog's test, keyed by host, so a freshly added or
  // edited row shows its measured value at once until the next services poll.
  const [seededLatency, setSeededLatency] = useState<Map<string, number | null>>(new Map())

  const probeByHost = useMemo(() => {
    const map = new Map<string, ServiceReachability>()
    for (const probe of reachability ?? []) map.set(probe.host, probe)
    return map
  }, [reachability])

  // Until the stored list loads, show the probed services so the page isn't blank.
  const listedServices: ServiceDefinition[] =
    services ?? (reachability ?? []).map(({ name, host }) => ({ name, host }))

  // Persist a confirmed add or edit. Re-adding the same host updates its label;
  // an edit that changed the host is a move, so drop the old host first.
  const saveService = (name: string, host: string, latencyMs: number | null): Promise<void> => {
    setSeededLatency((prev) => new Map(prev).set(host, latencyMs))
    const oldHost = dialog?.mode === 'edit' ? dialog.service.host : null
    const persist =
      oldHost && oldHost !== host ? remove(oldHost).then(() => add(name, host)) : add(name, host)
    return persist.then(refreshServices)
  }

  const removeService = (host: string): void => {
    void remove(host).then(refreshServices)
  }

  return (
    <div className="view-page">
      <ViewHeader
        icon={<CloudIcon size={18} />}
        title="Services"
        subtitle={
          <span className={styles.subtitle}>
            {tally && (
              <>
                {tally}
                <DotSeparator />
              </>
            )}
            <button type="button" className={styles.timelineLink} onClick={openTimeline}>
              <EventsIcon size={13} />
              <span className={styles.timelineLinkText}>View timeline</span>
              <ChevronRightIcon size={13} className="link-caret" />
            </button>
          </span>
        }
        isSubtitleShown
        actions={<AddServiceButton isOffline={isOfflineNow} onClick={() => setDialog({ mode: 'add' })} />}
      />

      {dialog && (
        <AddServiceDialog
          editing={
            dialog.mode === 'edit'
              ? { name: dialog.service.name, host: dialog.service.host }
              : undefined
          }
          onAdd={saveService}
          onClose={() => setDialog(null)}
        />
      )}

      {listedServices.length > 0 ? (
        <ul role="list" className={cx(styles.list, 'surface')} aria-label="Tracked services">
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
                  isOpen={openMenuHost === svc.host}
                  onOpenChange={setOpenMenuHost}
                  onEdit={() => {
                    setOpenMenuHost(null)
                    setDialog({ mode: 'edit', service: svc })
                  }}
                  onRemove={() => {
                    setOpenMenuHost(null)
                    removeService(svc.host)
                  }}
                />
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={CloudIcon}
          title="No services yet"
          hint="Add a service to start tracking it."
        />
      )}
    </div>
  )
}
