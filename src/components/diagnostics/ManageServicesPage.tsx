import { useEffect, useMemo, useRef, useState } from 'react'
import type { InternetStatus, ServiceDefinition, ServiceReachability } from '@/types'
import { ViewHeader } from '@/components/ui/ViewHeader'
import { MetricValue } from '@/components/ui/MetricValue'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { ChevronRightIcon, CloudIcon, EditIcon, EventsIcon, MoreVerticalIcon, PlusIcon, TrashIcon } from '@/components/ui/Icons'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tooltip } from '@/components/ui/Tooltip'
import { DotSeparator } from '@/components/ui/DotSeparator'
import { serviceTally } from '@/components/diagnostics/ServiceTally'
import { MAX_SAMPLES } from '@/components/diagnostics/service-latency'
import { Sparkline } from '@/components/ui/Sparkline'
import { useServices } from '@/hooks/useServices'
import { useServiceLatency } from '@/hooks/useServiceLatency'
import { AddServiceDialog } from '@/components/diagnostics/AddServiceDialog'
import { formatLatencyMs } from '@/lib/format'
import './ManageServicesPage.css'

// Same reachability bands the Services card uses, so a latency reads identically
// on the manage page and the card it came from.
function serviceLevel(ms: number): string {
  if (ms <= 120) return 'val-good'
  if (ms <= 300) return 'val-warn'
  return 'val-bad'
}

function isServiceErroring(httpStatus: number | null): boolean {
  return httpStatus !== null && httpStatus >= 500
}

/** The per-row overflow menu: a kebab that opens a dropdown with Edit and Remove.
 *  Closes on outside click or Escape. Only one is open at a time (the parent owns
 *  which host's menu is open). */
function RowMenu({
  service,
  isOpen,
  onOpenChange,
  onEdit,
  onRemove,
}: {
  service: ServiceDefinition
  isOpen: boolean
  onOpenChange: (host: string | null) => void
  onEdit: () => void
  onRemove: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onDocDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpenChange(null)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onOpenChange])

  return (
    <div className="mgsvc-menu" ref={ref}>
      <button
        type="button"
        className="mgsvc-kebab"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Options for ${service.name}`}
        onClick={() => onOpenChange(isOpen ? null : service.host)}
      >
        <MoreVerticalIcon size={16} />
      </button>
      {isOpen && (
        <div className="mgsvc-dropdown" role="menu">
          <button type="button" role="menuitem" className="mgsvc-menuitem" onClick={onEdit}>
            <EditIcon size={14} />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="mgsvc-menuitem is-danger"
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

interface ManageServicesPageProps {
  /** The latest reachability probes; latency is matched to rows by host. */
  reachability: ServiceReachability[] | undefined
  /** The internet reachability measured alongside `reachability` (same probe
   *  batch). When it isn't `online`, a probe in that batch that failed means "we
   *  couldn't check", not "the service is down", so those rows read as unknown
   *  ("—") rather than "Down" — matching the Services card. */
  internet: InternetStatus | undefined
  /** The app's live internet status — the same one the title bar shows. Drives
   *  the header ("No internet") and gates the Add button, so the page never
   *  disagrees with the title bar between probe batches. */
  liveInternet: InternetStatus | undefined
  /** Re-run diagnostics so a just-added/removed service's latency refreshes. */
  onRefresh: () => void
  /** Open the services timeline (linked from the subtitle). */
  onTimeline: () => void
}

type DialogState = { mode: 'add' } | { mode: 'edit'; service: ServiceDefinition }

/**
 * The Services page: the tracked-service list, where a service is added (by
 * URL/IP) or edited/removed from a per-row menu, with a link to the outage
 * timeline in the subtitle. The list is owned by the backend store (see
 * `useServices`); latency is overlaid from the latest diagnostics probes so each
 * row shows how it's doing.
 */
export function ManageServicesPage({
  reachability,
  internet,
  liveInternet,
  onRefresh,
  onTimeline,
}: ManageServicesPageProps): JSX.Element {
  const { services, add, remove } = useServices(true)
  // Rolling per-host latency history for each row's trend sparkline, appended
  // each diagnostics poll (recording is driven by the diagnostics effect).
  const latencyHistory = useServiceLatency()

  // Same rule as the Services card: with the internet unreachable when this batch
  // ran, a failed probe is our fault, not the service's — so read those rows as
  // unknown.
  const isInternetUnreachable = internet === 'noInternet' || internet === 'offline'
  // There's nothing to probe against while offline right now, so adding a
  // service is disabled until we're back.
  const isOfflineNow = liveInternet === 'noInternet' || liveInternet === 'offline'
  // The same live up/down count the timeline header shows, ahead of the timeline
  // link. Null until the first probes land, so the link stands alone until then.
  const tally = serviceTally(reachability, liveInternet)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [menuHost, setMenuHost] = useState<string | null>(null)
  // Latency captured by the dialog's test, keyed by host, so a freshly added or
  // edited row shows its measured value at once until the next diagnostics run.
  const [seededLatency, setSeededLatency] = useState<Map<string, number | null>>(new Map())

  const reachByHost = useMemo(() => {
    const map = new Map<string, ServiceReachability>()
    for (const s of reachability ?? []) map.set(s.host, s)
    return map
  }, [reachability])

  const rows: ServiceDefinition[] =
    services ?? (reachability ?? []).map(({ name, host }) => ({ name, host }))

  // Persist a confirmed add or edit. Re-adding the same host updates its label;
  // an edit that changed the host is a move, so drop the old host first.
  const saveService = (name: string, host: string, latencyMs: number | null): Promise<void> => {
    setSeededLatency((prev) => new Map(prev).set(host, latencyMs))
    const oldHost = dialog?.mode === 'edit' ? dialog.service.host : null
    const persist =
      oldHost && oldHost !== host ? remove(oldHost).then(() => add(name, host)) : add(name, host)
    return persist.then(onRefresh)
  }

  const deleteRow = (host: string): void => {
    void remove(host).then(onRefresh)
  }

  const addButton = isOfflineNow ? (
    <Tooltip content="Connect to the internet first">
      <button type="button" className="btn-primary mgsvc-add" disabled aria-label="Add service">
        <PlusIcon size={14} />
        Add service
      </button>
    </Tooltip>
  ) : (
    <button
      type="button"
      className="btn-primary mgsvc-add"
      onClick={() => setDialog({ mode: 'add' })}
      aria-haspopup="dialog"
    >
      <PlusIcon size={14} />
      Add service
    </button>
  )

  return (
    <div className="view-page mgsvc-page">
      <ViewHeader
        icon={<CloudIcon size={18} />}
        title="Services"
        subtitle={
          <span className="mgsvc-subtitle">
            {tally && (
              <>
                {tally}
                <DotSeparator />
              </>
            )}
            <button type="button" className="mgsvc-timeline-link" onClick={onTimeline}>
              <EventsIcon size={13} />
              <span className="mgsvc-timeline-link-text">View timeline</span>
              <ChevronRightIcon size={13} className="link-caret" />
            </button>
          </span>
        }
        isSubtitleShown
        actions={addButton}
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

      {rows.length > 0 ? (
        <div className="mgsvc-list surface">
          {rows.map((svc) => {
            const probe = reachByHost.get(svc.host)
            const latency = probe ? probe.latencyMs : seededLatency.get(svc.host)
            const isErroring = probe ? isServiceErroring(probe.httpStatus) : false
            const samples = latencyHistory[svc.host] ?? []
            // Down the same way the status reads it: a failed path (only when the
            // internet is up, else it's our fault) or a reachable-but-erroring
            // host. A down row's sparkline is a flat red line, not its old trend.
            const isDown = probe
              ? isErroring || (probe.latencyMs === null && !isInternetUnreachable)
              : false
            return (
              <div className="mgsvc-row" key={svc.host}>
                <div className="mgsvc-body">
                  <div className="mgsvc-line">
                    <ServiceIcon host={svc.host} name={svc.name} />
                    <span className="mgsvc-name">{svc.name}</span>
                    {(samples.length > 0 || isDown) && (
                      <Sparkline
                        samples={samples}
                        slots={MAX_SAMPLES}
                        isDown={isDown}
                        width={64}
                        height={20}
                        label={svc.name}
                      />
                    )}
                  </div>
                  <div className="mgsvc-line mgsvc-line-sub">
                    <span className="mgsvc-host">{svc.host}</span>
                    <span className="mgsvc-status num">
                      {latency === undefined ? (
                        <span className="text-hint">…</span>
                      ) : latency === null ? (
                        // Path failed. Only a genuine "Down" when we know the internet
                        // is up; otherwise the failure is ours, so read it as unknown.
                        isInternetUnreachable ? (
                          <span className="text-hint">—</span>
                        ) : (
                          <span className="val-bad">Down</span>
                        )
                      ) : isErroring ? (
                        <span className="val-bad">Down</span>
                      ) : (
                        <MetricValue value={latency} level={serviceLevel(latency)} format={formatLatencyMs} />
                      )}
                    </span>
                  </div>
                </div>
                <RowMenu
                  service={svc}
                  isOpen={menuHost === svc.host}
                  onOpenChange={setMenuHost}
                  onEdit={() => {
                    setMenuHost(null)
                    setDialog({ mode: 'edit', service: svc })
                  }}
                  onRemove={() => {
                    setMenuHost(null)
                    deleteRow(svc.host)
                  }}
                />
              </div>
            )
          })}
        </div>
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
