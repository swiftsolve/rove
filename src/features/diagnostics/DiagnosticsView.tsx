import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import type { IspInfo, NetworkDiagnostics, PingStats } from '@/types'
import { FAILED_PING, getLinkCapacityMbps } from '@/types'
import { DataList, DataRow } from '@/components/DataRow'
import { Section, SectionBadge } from '@/components/Section'
import { ConnectionIcon, DnsIcon, GlobeIcon, HelpIcon, RouterIcon } from '@/components/icons/Icons'
import { IconButton } from '@/components/IconButton'
import { Tooltip } from '@/components/Tooltip'
import { MetricValue, type MetricLevel } from '@/components/MetricValue'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useDiagnostics } from '@/features/diagnostics/hooks/useDiagnostics'

const DIAGNOSTICS_HINT =
  'Latency comes from pinging your router, and some routers answer pings slowly on purpose. ISP details are looked up from your public IP.'

/** Gateway round trips up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 40
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 120
/** Any packet loss is worth flagging; past this it reads as bad, not just amber. */
const WARN_LOSS_MAX_PCT = 2

// The packet-loss warning band reads as a continuation of the readout rather
// than a divided-off footnote: no top line, and a roomier vertical padding so
// the band has enough breathing room.
const ROUTER_FOOTER = cx(
  '[&_.ui-section-footer]:pt-12 [&_.ui-section-footer]:pb-16',
  '[&_.ui-section-footer]:border-t-0',
)

// Tighter row rhythm for the Router (and ISP) and DNS readouts: less vertical
// air between each label/value pair than the default 8px. First/last stay flush
// to the body (DataRow zeroes them). DNS sits a touch looser
// than Router since its repeated identical rows read denser at the same padding.
const TIGHT_ROWS = cx(
  '[&_.data-row:not(:first-child)]:pt-4',
  '[&_.data-row:not(:last-child)]:pb-4',
)
// The Router readout comes in three groups (quality, connection, device) split
// by a hairline that runs the card's full width, like the connection card's
// details: the body drops its side inset and each group carries it instead.
const ROUTER_BODY = cx(
  'row-list px-0',
  'divide-y divide-line [&>dl:not(:first-child)]:pt-12 [&>dl:not(:last-child)]:pb-12',
)
const ROUTER_GROUP = cx('row-list px-(--section-body-padding)', TIGHT_ROWS)
const DNS_ROWS = cx(
  '[&_.data-row:not(:first-child)]:pt-6',
  '[&_.data-row:not(:last-child)]:pb-6',
)

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase()
}

function formatPercent(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

function latencyLevel(ms: number): MetricLevel {
  if (!Number.isFinite(ms) || ms >= FAILED_PING.avgMs) return 'bad'
  if (ms <= GOOD_LATENCY_MAX_MS) return 'good'
  if (ms <= WARN_LATENCY_MAX_MS) return 'warn'
  return 'bad'
}

function lossLevel(pct: number): MetricLevel {
  if (pct <= 0) return 'good'
  if (pct <= WARN_LOSS_MAX_PCT) return 'warn'
  return 'bad'
}

function formatLocation(isp: IspInfo): string | null {
  const parts = [isp.city, isp.region, isp.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function headerSubtitle(isRunning: boolean, hasDiagnostics: boolean): ReactNode {
  if (isRunning) return <span className="page-header-status text-tertiary">Checking…</span>
  if (hasDiagnostics) return 'Router, DNS, and ISP'
  return <span className="page-header-status text-tertiary">&nbsp;</span>
}

/** What the screen-reader status line says: each run's start and its end. */
function runStatusText(isRunning: boolean, hasDiagnostics: boolean): string {
  if (isRunning) return 'Checking your connection…'
  return hasDiagnostics ? 'Connection checks finished.' : ''
}

function latencyValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return '—'
  if (ping.avgMs >= FAILED_PING.avgMs) return <span className="val-bad">Down</span>
  return <MetricValue value={ping.avgMs} level={latencyLevel(ping.avgMs)} format={formatLatencyMs} />
}

function jitterValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return '—'
  if (ping.jitterMs >= FAILED_PING.avgMs) return 'Down'
  return <MetricValue value={ping.jitterMs} format={formatLatencyMs} />
}

function RouterSection({ diagnostics }: { diagnostics: NetworkDiagnostics | null }): JSX.Element {
  const { info } = useNetwork()
  const ping = diagnostics?.gatewayPing
  // Negotiated link rate of the local connection to the router (Wi-Fi/Ethernet),
  // or null when disconnected or the OS doesn't report it.
  const linkSpeedMbps = info ? getLinkCapacityMbps(info) : null
  // Many routers report their model as their name too; show it once.
  const model = sameText(diagnostics?.gatewayModel, diagnostics?.gatewayName)
    ? null
    : (diagnostics?.gatewayModel || null)
  const hasDeviceRows = Boolean(diagnostics?.gatewayName || model || diagnostics?.gatewayVendor)

  return (
    <Section
      title="Router"
      className={ROUTER_FOOTER}
      icon={<RouterIcon size={15} />}
      bodyClassName={ROUTER_BODY}
      footer={
        ping && ping.packetLoss > 0 ? (
          <p className="text-small">
            Packet loss can cause slow or unstable connections.
          </p>
        ) : undefined
      }
    >
      <DataList className={ROUTER_GROUP}>
        <DataRow label="Latency">{latencyValue(ping)}</DataRow>
        <DataRow label="Jitter">{jitterValue(ping)}</DataRow>
        <DataRow label="Packet loss">
          {ping ? (
            <MetricValue value={ping.packetLoss} level={lossLevel(ping.packetLoss)} format={formatPercent} />
          ) : (
            '—'
          )}
        </DataRow>
      </DataList>
      <DataList className={ROUTER_GROUP}>
        <DataRow label="Gateway" value={diagnostics?.gateway ?? '—'} />
        <DataRow label="Interface" value={diagnostics?.defaultInterface ?? '—'} />
        {linkSpeedMbps != null && (
          <DataRow label="Link speed">
            <MetricValue value={linkSpeedMbps} format={formatSpeedMbps} />
          </DataRow>
        )}
      </DataList>
      {hasDeviceRows && (
        <DataList className={ROUTER_GROUP}>
          <DataRow label="Name" value={diagnostics?.gatewayName || null} />
          <DataRow label="Model" value={model} />
          <DataRow label="Vendor" value={diagnostics?.gatewayVendor || null} />
        </DataList>
      )}
    </Section>
  )
}

function DnsSection({ servers }: { servers: string[] }): JSX.Element {
  return (
    <Section
      title="DNS"
      icon={<DnsIcon size={15} />}
      bodyClassName={cx('row-list', DNS_ROWS)}
      // Label/value pairs when there are servers; otherwise a single note.
      bodyAs={servers.length > 0 ? 'dl' : 'div'}
    >
      {servers.length > 0 ? (
        servers.map((server) => <DataRow key={server} label="Server" value={server} />)
      ) : (
        <p className="text-small">No DNS servers found.</p>
      )}
    </Section>
  )
}

// The ISP card's right-hand slot: a small "VPN" pill when our egress is a
// hosting/datacenter ASN (the rows then describe the exit node, not the real
// ISP), otherwise the brand mark — but only if one actually resolves. Plenty of
// ISPs have no favicon (Comcast, for one), and a lone letter here would read as
// a glitch rather than a brand, so this slot stays empty rather than falling
// back to a monogram. A VPN exit has no brand domain, so the two never contend.
function ispBadge(isp: IspInfo | null | undefined): ReactNode {
  if (isp?.isVpn) return <SectionBadge>VPN</SectionBadge>
  if (isp?.domain) {
    return <ServiceIcon host={isp.domain} name={isp.name ?? 'ISP'} size={18} fallback="none" />
  }
  return undefined
}

function IspSection({ diagnostics }: { diagnostics: NetworkDiagnostics | null }): JSX.Element {
  const isp = diagnostics?.isp

  return (
    <Section
      title={isp?.isVpn ? 'VPN' : 'ISP'}
      icon={<GlobeIcon size={15} />}
      bodyClassName={cx('row-list', TIGHT_ROWS)}
      bodyAs={isp ? 'dl' : 'div'}
      action={ispBadge(isp)}
    >
      {isp ? (
        <>
          {/* "Provider", not "ISP": the card's title already says ISP, and
              under a VPN the value is the exit node's hosting company, which
              "Provider" describes either way. */}
          <DataRow label="Provider" value={isp.name} />
          {/* "Website", not "Domain" — in a network tool the latter reads
              as a DHCP search domain. DataRow hides itself when null, so
              a lookup that named no domain simply has no row. */}
          <DataRow label="Website" value={isp.domain} />
          <DataRow label="ASN" value={isp.asn} />
          <DataRow label="Public IP" value={isp.publicIp} />
          <DataRow label="Location" value={formatLocation(isp)} />
        </>
      ) : (
        // The card resolves ISP/ASN/country on-device, so it only lands here
        // when we couldn't even learn our own public IP — i.e. offline. Guard
        // the copy on the known internet state anyway, so a transient
        // echo-service blip while online doesn't claim we're offline.
        <p className="text-small">
          {diagnostics?.internet === 'online'
            ? 'Provider details are momentarily unavailable.'
            : 'Provider details are unavailable offline.'}
        </p>
      )}
    </Section>
  )
}

export function DiagnosticsView(): JSX.Element {
  const { diagnostics, isRunning, error, run } = useDiagnostics()
  const runDiagnostics = (): void => {
    void run()
  }
  const hasDiagnostics = diagnostics != null
  const isFirstCheck = isRunning && !diagnostics

  return (
    <div className="page">
      <ViewHeader
        icon={<ConnectionIcon size={18} />}
        title="Connection"
        subtitle={headerSubtitle(isRunning, hasDiagnostics)}
        isSubtitleShown={hasDiagnostics && !isRunning}
        actions={
          <>
            <Tooltip content={DIAGNOSTICS_HINT}>
              <IconButton
                aria-label="About connection checks"
              >
                <HelpIcon size={16} />
              </IconButton>
            </Tooltip>
            <RefreshIconButton label="Run again" isBusy={isRunning} onClick={runDiagnostics} />
          </>
        }
      />

      <p className="sr-only" role="status">
        {runStatusText(isRunning, hasDiagnostics)}
      </p>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {isFirstCheck ? (
        <div className="page-empty" aria-busy="true">
          <Spinner />
          <p className="text-muted">Checking your connection…</p>
        </div>
      ) : (
        <>
          <RouterSection diagnostics={diagnostics} />
          <DnsSection servers={diagnostics?.dnsServers ?? []} />
          <IspSection diagnostics={diagnostics} />
        </>
      )}
    </div>
  )
}
