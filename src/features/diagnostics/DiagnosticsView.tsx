import type { ReactNode } from 'react'
import type { IspInfo, NetworkDiagnostics, PingStats } from '@/types'
import { FAILED_PING, getLinkCapacityMbps } from '@/types'
import {
  Badge,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ConnectionIcon,
  DataList,
  DataListStack,
  DataRow,
  DnsIcon,
  Banner,
  GlobeIcon,
  HelpIcon,
  IconButton,
  LoadingState,
  MetricValue,
  PageHeader,
  RefreshIcon,
  RouterIcon,
  type MetricStatus,
} from '@/ui'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useDiagnostics } from '@/features/diagnostics/hooks/useDiagnostics'

const DIAGNOSTICS_HINT =
  'Latency pings your router, and some routers answer slowly on purpose. ISP details come from your public IP.'

/** Gateway round trips up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 40
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 120
/** Any packet loss is worth flagging; past this it reads as bad, not just amber. */
const WARN_LOSS_MAX_PCT = 2

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase()
}

function formatPercent(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

function latencyStatus(ms: number): MetricStatus {
  if (!Number.isFinite(ms) || ms >= FAILED_PING.avgMs) return 'negative'
  if (ms <= GOOD_LATENCY_MAX_MS) return 'positive'
  if (ms <= WARN_LATENCY_MAX_MS) return 'warning'
  return 'negative'
}

function lossStatus(pct: number): MetricStatus {
  if (pct <= 0) return 'positive'
  if (pct <= WARN_LOSS_MAX_PCT) return 'warning'
  return 'negative'
}

function formatLocation(isp: IspInfo): string | null {
  const parts = [isp.city, isp.region, isp.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** What the screen-reader status line says: each run's start and its end. */
function runStatusText(isRunning: boolean, hasDiagnostics: boolean): string {
  if (isRunning) return 'Checking your connection…'
  return hasDiagnostics ? 'Connection checks finished.' : ''
}

function latencyValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return '—'
  if (ping.avgMs >= FAILED_PING.avgMs) return <span className="text-negative">Down</span>
  return <MetricValue value={ping.avgMs} status={latencyStatus(ping.avgMs)} format={formatLatencyMs} />
}

function jitterValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return '—'
  if (ping.jitterMs >= FAILED_PING.avgMs) return 'Down'
  return <MetricValue value={ping.jitterMs} format={formatLatencyMs} />
}

function RouterCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }): JSX.Element {
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
    <Card>
      <CardHeader title="Router" icon={<RouterIcon size={15} />} />
      {/* Three groups (quality, connection, device) split by a hairline that
          runs the card's full width, like the connection card's details. */}
      <CardBody layout="flush">
        <DataListStack>
          <DataList density="compact">
            <DataRow label="Latency">{latencyValue(ping)}</DataRow>
            <DataRow label="Jitter">{jitterValue(ping)}</DataRow>
            <DataRow label="Packet loss">
              {ping ? (
                <MetricValue value={ping.packetLoss} status={lossStatus(ping.packetLoss)} format={formatPercent} />
              ) : (
                '—'
              )}
            </DataRow>
          </DataList>
          <DataList density="compact">
            <DataRow label="Gateway" value={diagnostics?.gateway ?? '—'} />
            <DataRow label="Interface" value={diagnostics?.defaultInterface ?? '—'} />
            {linkSpeedMbps != null && (
              <DataRow label="Link speed">
                <MetricValue value={linkSpeedMbps} format={formatSpeedMbps} />
              </DataRow>
            )}
          </DataList>
          {hasDeviceRows && (
            <DataList density="compact">
              <DataRow label="Name" value={diagnostics?.gatewayName || null} />
              <DataRow label="Model" value={model} />
              <DataRow label="Vendor" value={diagnostics?.gatewayVendor || null} />
            </DataList>
          )}
        </DataListStack>
      </CardBody>
      {ping && ping.packetLoss > 0 && (
        <CardFooter>
          <p className="text-body-small">Packet loss can cause slow or unstable connections.</p>
        </CardFooter>
      )}
    </Card>
  )
}

function DnsCard({ servers }: { servers: string[] }): JSX.Element {
  return (
    <Card>
      <CardHeader title="DNS" icon={<DnsIcon size={15} />} />
      <CardBody>
        {servers.length > 0 ? (
          <DataList density="compact">
            {servers.map((server) => (
              <DataRow key={server} label="Server" value={server} />
            ))}
          </DataList>
        ) : (
          <p className="text-body-small">No DNS servers found.</p>
        )}
      </CardBody>
    </Card>
  )
}

// The ISP card's right-hand slot: a small "VPN" pill when our egress is a
// hosting/datacenter ASN (the rows then describe the exit node, not the real
// ISP), otherwise the brand mark — but only if one actually resolves. Plenty of
// ISPs have no favicon (Comcast, for one), and a lone letter here would read as
// a glitch rather than a brand, so this slot stays empty rather than falling
// back to a monogram. A VPN exit has no brand domain, so the two never contend.
function ispBadge(isp: IspInfo | null | undefined): ReactNode {
  if (isp?.isVpn) return <Badge tone="positive">VPN</Badge>
  if (isp?.domain) {
    return <ServiceIcon host={isp.domain} name={isp.name ?? 'ISP'} size={18} fallback="none" />
  }
  return undefined
}

function IspCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }): JSX.Element {
  const isp = diagnostics?.isp

  return (
    <Card>
      <CardHeader title={isp?.isVpn ? 'VPN' : 'ISP'} icon={<GlobeIcon size={15} />} actions={ispBadge(isp)} />
      <CardBody>
        {isp ? (
          <DataList density="compact">
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
          </DataList>
        ) : (
          // The card resolves ISP/ASN/country on-device, so it only lands here
          // when we couldn't even learn our own public IP — i.e. offline. Guard
          // the copy on the known internet state anyway, so a transient
          // echo-service blip while online doesn't claim we're offline.
          <p className="text-body-small">
            {diagnostics?.internet === 'online'
              ? 'Provider details are momentarily unavailable.'
              : 'Provider details are unavailable offline.'}
          </p>
        )}
      </CardBody>
    </Card>
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
      <PageHeader
        icon={<ConnectionIcon size={18} />}
        title="Connection"
        description={hasDiagnostics ? 'Router, DNS, and ISP' : null}
        status={isRunning ? 'Checking…' : undefined}
        actions={
          <>
            <IconButton label="About connection checks" icon={HelpIcon} tooltip={DIAGNOSTICS_HINT} />
            <IconButton label="Run again" icon={RefreshIcon} isLoading={isRunning} onClick={runDiagnostics} />
          </>
        }
      />

      <p className="sr-only" role="status">
        {runStatusText(isRunning, hasDiagnostics)}
      </p>

      {error && <Banner
          variant="error"
          title={error}
          description={diagnostics ? 'Showing the last check.' : 'Try again in a moment.'}
          onRetry={run}
        />}

      {isFirstCheck ? (
        <LoadingState label="Checking your connection…" />
      ) : (
        <>
          <RouterCard diagnostics={diagnostics} />
          <DnsCard servers={diagnostics?.dnsServers ?? []} />
          <IspCard diagnostics={diagnostics} />
        </>
      )}
    </div>
  )
}
