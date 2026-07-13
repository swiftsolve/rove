import { useEffect, useMemo, useRef, useState } from 'react'
import type { ServiceDefinition, ServiceReachability } from '@/types'
import Subpage from '@/components/ui/Subpage'
import { MetricValue } from '@/components/ui/MetricValue'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { EditIcon, MoreIcon, PlusIcon, TrashIcon } from '@/components/ui/Icons'
import { useServices } from '@/hooks/useServices'
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
  open,
  onOpenChange,
  onEdit,
  onRemove,
}: {
  readonly service: ServiceDefinition
  readonly open: boolean
  readonly onOpenChange: (host: string | null) => void
  readonly onEdit: () => void
  readonly onRemove: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
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
  }, [open, onOpenChange])

  return (
    <div className="mgsvc-menu" ref={ref}>
      <button
        type="button"
        className="mgsvc-kebab"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${service.name}`}
        onClick={() => onOpenChange(open ? null : service.host)}
      >
        <MoreIcon size={16} />
      </button>
      {open && (
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
  readonly reachability: readonly ServiceReachability[] | undefined
  /** Re-run diagnostics so a just-added/removed service's latency refreshes. */
  readonly onRefresh: () => void
  readonly onBack: () => void
}

type DialogState = { readonly mode: 'add' } | { readonly mode: 'edit'; readonly service: ServiceDefinition }

/**
 * The full-page editor for the tracked-service list: add a service (by URL/IP),
 * or edit/remove any of them from a per-row menu, with a back button to the
 * Connection view. The list is owned by the backend store (see `useServices`);
 * latency is overlaid from the latest diagnostics probes so each row still shows
 * how it's doing while you edit.
 */
export function ManageServicesPage({
  reachability,
  onRefresh,
  onBack,
}: ManageServicesPageProps): JSX.Element {
  const { services, add, remove } = useServices(true)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [menuHost, setMenuHost] = useState<string | null>(null)
  // Latency captured by the dialog's test, keyed by host, so a freshly added or
  // edited row shows its measured value at once until the next diagnostics run.
  const [seededLatency, setSeededLatency] = useState<ReadonlyMap<string, number | null>>(new Map())

  const reachByHost = useMemo(() => {
    const map = new Map<string, ServiceReachability>()
    for (const s of reachability ?? []) map.set(s.host, s)
    return map
  }, [reachability])

  const rows: readonly ServiceDefinition[] =
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

  const addButton = (
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
    <Subpage
      title="Services"
      description="Add, edit, or remove the services you track"
      action={addButton}
      className="mgsvc-page"
      onBack={onBack}
    >
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
            const erroring = probe ? isServiceErroring(probe.httpStatus) : false
            return (
              <div className="mgsvc-row" key={svc.host}>
                <span className="mgsvc-label">
                  <ServiceIcon host={svc.host} name={svc.name} />
                  <span className="mgsvc-name">{svc.name}</span>
                </span>
                <span className="mgsvc-status num">
                  {latency === undefined ? (
                    <span className="text-hint">…</span>
                  ) : latency === null || erroring ? (
                    <span className="val-bad">Unreachable</span>
                  ) : (
                    <MetricValue value={latency} level={serviceLevel(latency)} format={formatLatencyMs} />
                  )}
                </span>
                <RowMenu
                  service={svc}
                  open={menuHost === svc.host}
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
        <div className="mgsvc-empty surface">
          <p className="text-hint">No services yet. Add one to start tracking it.</p>
        </div>
      )}
    </Subpage>
  )
}
