import { useMemo, useState } from 'react'
import type { ServiceDefinition, ServiceReachability } from '@/types'
import Section from '@/components/ui/Section'
import { MetricValue } from '@/components/ui/MetricValue'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { CheckIcon, CloudIcon, EditIcon, PlusIcon, TrashIcon } from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { useServices } from '@/hooks/useServices'
import { AddServiceDialog } from '@/components/diagnostics/AddServiceDialog'
import { formatLatencyMs } from '@/lib/format'
import './ServicesSection.css'

// Service reachability is a full TLS handshake to :443 (DNS + TCP + TLS), so its
// round-trips run well above a bare ICMP ping. The bands are looser than the
// gateway's to match. A null latency means the handshake never completed.
function serviceLevel(ms: number): string {
  if (ms <= 120) return 'val-good'
  if (ms <= 300) return 'val-warn'
  return 'val-bad'
}

interface ServicesSectionProps {
  /** The latest reachability probes; latency is matched to rows by host. */
  readonly reachability: readonly ServiceReachability[] | undefined
  /** Re-run diagnostics so a just-added/removed service's latency refreshes. */
  readonly onRefresh: () => void
}

/** The Connection view's editable "Services" card: the reachability list plus
 *  the controls to add a service (by URL/IP) and remove any of them. The list
 *  itself is owned by the backend store (see `useServices`); this only measures
 *  and renders it. */
export function ServicesSection({ reachability, onRefresh }: ServicesSectionProps): JSX.Element {
  const { services, add, remove } = useServices(true)
  const [isManaging, setIsManaging] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  // Latency is keyed by host and overlaid on the canonical list, so a freshly
  // added service (not yet in a probe) simply reads as "pending" until the next
  // run lands. Falls back to the probe list itself before `useServices` resolves
  // so the card never flashes empty on open.
  const latencyByHost = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const s of reachability ?? []) map.set(s.host, s.latencyMs)
    return map
  }, [reachability])

  const rows: readonly ServiceDefinition[] =
    services ?? (reachability ?? []).map(({ name, host }) => ({ name, host }))

  const openAdd = (): void => {
    setIsManaging(false)
    setIsAdding(true)
  }

  const toggleManage = (): void => {
    setIsManaging((v) => !v)
  }

  const addService = (name: string, host: string): Promise<void> =>
    add(name, host).then(onRefresh)

  const deleteRow = (host: string): void => {
    void remove(host).then(onRefresh)
  }

  const action = (
    <div className="svc-actions">
      {rows.length > 0 && (
        <Tooltip content={isManaging ? 'Done' : 'Edit services'}>
          <button
            type="button"
            className="btn-icon btn-icon-secondary"
            onClick={toggleManage}
            aria-label={isManaging ? 'Done editing services' : 'Edit services'}
            aria-pressed={isManaging}
          >
            {isManaging ? <CheckIcon size={16} /> : <EditIcon size={15} />}
          </button>
        </Tooltip>
      )}
      <Tooltip content="Add a service">
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          onClick={openAdd}
          aria-label="Add a service"
          aria-haspopup="dialog"
        >
          <PlusIcon size={16} />
        </button>
      </Tooltip>
    </div>
  )

  return (
    <>
      {isAdding && (
        <AddServiceDialog onAdd={addService} onClose={() => setIsAdding(false)} />
      )}
      <Section
        title="Services"
        icon={<CloudIcon size={15} />}
        action={action}
        bodyClassName="row-list diag-router"
      >
      {rows.length > 0 ? (
        rows.map((svc) => {
          const latency = latencyByHost.get(svc.host)
          return (
            <div className="data-row svc-row" key={svc.host}>
              <span className="field-label service-label">
                <ServiceIcon host={svc.host} name={svc.name} />
                {svc.name}
              </span>
              {isManaging ? (
                <button
                  type="button"
                  className="svc-delete"
                  onClick={() => deleteRow(svc.host)}
                  aria-label={`Remove ${svc.name}`}
                >
                  <TrashIcon size={15} />
                </button>
              ) : (
                <span className="text-value num">
                  {latency === undefined ? (
                    <span className="text-hint">…</span>
                  ) : latency === null ? (
                    <span className="val-bad">Unreachable</span>
                  ) : (
                    <MetricValue
                      value={latency}
                      level={serviceLevel(latency)}
                      format={formatLatencyMs}
                    />
                  )}
                </span>
              )}
            </div>
          )
        })
      ) : (
        <p className="text-hint">No services yet. Add one with +.</p>
      )}
      </Section>
    </>
  )
}
