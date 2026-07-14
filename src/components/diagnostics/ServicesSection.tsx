import { useMemo } from 'react'
import type { InternetStatus, ServiceDefinition, ServiceReachability } from '@/types'
import Section from '@/components/ui/Section'
import { MetricValue } from '@/components/ui/MetricValue'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { CloudIcon, EditIcon, HistoryIcon } from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { useServices } from '@/hooks/useServices'
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

// A 5xx status means the network path is fine (we reached and TLS-negotiated the
// host) but the service itself is erroring — e.g. a Cloudflare 1033 tunnel error
// answers HTTP 530. That's worth surfacing distinctly from a clean latency, so a
// green number never masks a down service. Anything below 500 (including 4xx bot
// walls like 403) counts the service as up.
function isServiceErroring(httpStatus: number | null): boolean {
  return httpStatus !== null && httpStatus >= 500
}

interface ServicesSectionProps {
  /** The latest reachability probes; latency is matched to rows by host. */
  readonly reachability: readonly ServiceReachability[] | undefined
  /** This machine's own internet reachability. When it isn't `online`, a probe
   *  that failed means "we couldn't check", not "the service is down" — so those
   *  rows read as unknown rather than falsely accusing the service. Undefined
   *  before the first probe lands (treated as online, since there's nothing to
   *  judge yet). */
  readonly internet: InternetStatus | undefined
  /** Open the full-page editor to add or remove services. */
  readonly onManage: () => void
  /** Open the timeline of service outages and recoveries. */
  readonly onTimeline: () => void
}

/** The Connection view's "Services" card: the read-only reachability list plus a
 *  single control to open the manage page, where services are added and removed.
 *  The list itself is owned by the backend store (see `useServices`); this only
 *  measures and renders it. */
export function ServicesSection({ reachability, internet, onManage, onTimeline }: ServicesSectionProps): JSX.Element {
  const { services } = useServices(true)

  // When this machine can't reach the internet, a failed probe tells us nothing
  // about the service — the break is on our end. So those rows read as unknown
  // ("—") rather than "Down". A service that still answers (e.g. a LAN host
  // reachable with the WAN down) keeps its real number.
  const cannotReachInternet = internet === 'noInternet' || internet === 'offline'

  // Latency is keyed by host and overlaid on the canonical list, so a freshly
  // added service (not yet in a probe) simply reads as "pending" until the next
  // run lands. Falls back to the probe list itself before `useServices` resolves
  // so the card never flashes empty on open.
  const reachByHost = useMemo(() => {
    const map = new Map<string, ServiceReachability>()
    for (const s of reachability ?? []) map.set(s.host, s)
    return map
  }, [reachability])

  const rows: readonly ServiceDefinition[] =
    services ?? (reachability ?? []).map(({ name, host }) => ({ name, host }))

  const action = (
    <div className="svc-actions">
      <Tooltip content="Services timeline">
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          onClick={onTimeline}
          aria-label="Services timeline"
        >
          <HistoryIcon size={15} />
        </button>
      </Tooltip>
      <Tooltip content="Manage services">
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          onClick={onManage}
          aria-label="Manage services"
        >
          <EditIcon size={15} />
        </button>
      </Tooltip>
    </div>
  )

  return (
    <Section
      title="Services"
      icon={<CloudIcon size={15} />}
      action={action}
      bodyClassName="row-list diag-router"
    >
      {rows.length > 0 ? (
        rows.map((svc) => {
          const probe = reachByHost.get(svc.host)
          // Prefer the live probe; before it lands, the row simply reads as pending.
          const latency = probe ? probe.latencyMs : undefined
          const erroring = probe ? isServiceErroring(probe.httpStatus) : false
          return (
            <div className="data-row svc-row" key={svc.host}>
              <span className="field-label service-label">
                <ServiceIcon host={svc.host} name={svc.name} />
                {svc.name}
              </span>
              <span className="text-value num">
                {latency === undefined ? (
                  <span className="text-hint">…</span>
                ) : latency === null ? (
                  // Path failed. Only a genuine "Down" when we know the internet
                  // is up; otherwise the failure is ours, so read it as unknown.
                  cannotReachInternet ? (
                    <span className="text-hint">—</span>
                  ) : (
                    <span className="val-bad">Down</span>
                  )
                ) : erroring ? (
                  // Reachable but erroring (5xx) — genuinely down regardless of us.
                  <span className="val-bad">Down</span>
                ) : (
                  <MetricValue
                    value={latency}
                    level={serviceLevel(latency)}
                    format={formatLatencyMs}
                  />
                )}
              </span>
            </div>
          )
        })
      ) : (
        <p className="text-hint">No services yet. Add one from Manage.</p>
      )}
    </Section>
  )
}
