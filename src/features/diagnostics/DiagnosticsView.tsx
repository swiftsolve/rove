import type { ReactNode } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { useDiagnostics } from '@/features/diagnostics/hooks/useDiagnostics'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import type { IspInfo, NetworkDiagnostics, PingStats } from '@/types'
import { FAILED_PING, getLinkCapacityMbps } from '@/types'
import {
  Badge,
  Banner,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ConnectionIcon,
  DataList,
  DataListStack,
  DataRow,
  DnsIcon,
  GlobeIcon,
  HelpIcon,
  IconButton,
  LoadingState,
  type MetricStatus,
  MetricValue,
  PageHeader,
  RefreshIcon,
  RouterIcon,
} from '@/ui'

const DIAGNOSTICS_HINT =
  'Latency pings your router, and some routers answer slowly on purpose. ISP details come from your public IP.'

/** Gateway round trips up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 40
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 120
/** Any packet loss is worth flagging; past this it reads as bad, not just amber. */
const WARN_LOSS_MAX_PCT = 2

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
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

function RouterCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }) {
  const { info } = useNetwork()
  const ping = diagnostics?.gatewayPing
  const linkSpeedMbps = info ? getLinkCapacityMbps(info) : null
  // Many routers report their model as their name too; show it once.
  const model = sameText(diagnostics?.gatewayModel, diagnostics?.gatewayName) ? null : diagnostics?.gatewayModel || null
  const hasDeviceRows = Boolean(diagnostics?.gatewayName || model || diagnostics?.gatewayVendor)

  return (
    <Card>
      <CardHeader title="Router" icon={<RouterIcon size={15} />} />
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
          <p className="type-body-small text-tertiary">Packet loss can cause slow or unstable connections.</p>
        </CardFooter>
      )}
    </Card>
  )
}

function DnsCard({ servers }: { servers: string[] }) {
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
          <p className="type-body-small text-tertiary">No DNS servers found.</p>
        )}
      </CardBody>
    </Card>
  )
}

// "VPN" when the egress is a hosting ASN, else the brand mark if one resolves.
// No monogram fallback: many ISPs have no favicon, and a lone letter reads as a glitch.
function ispBadge(isp: IspInfo | null | undefined): ReactNode {
  if (isp?.isVpn) return <Badge tone="positive">VPN</Badge>
  if (isp?.domain) {
    return <ServiceIcon host={isp.domain} name={isp.name ?? 'ISP'} size={18} fallback="none" />
  }
  return undefined
}

function IspCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }) {
  const isp = diagnostics?.isp

  return (
    <Card>
      <CardHeader title={isp?.isVpn ? 'VPN' : 'ISP'} icon={<GlobeIcon size={15} />} actions={ispBadge(isp)} />
      <CardBody>
        {isp ? (
          <DataList density="compact">
            {/* "Provider", not "ISP": under a VPN this is the exit node's host. */}
            <DataRow label="Provider" value={isp.name} />
            {/* "Website", not "Domain", which reads as a DHCP search domain here. */}
            <DataRow label="Website" value={isp.domain} />
            <DataRow label="ASN" value={isp.asn} />
            <DataRow label="Public IP" value={isp.publicIp} />
            <DataRow label="Location" value={formatLocation(isp)} />
          </DataList>
        ) : (
          // Reached only without a public IP, usually offline. The copy checks the
          // internet state so an echo-service blip doesn't claim we're offline.
          <p className="type-body-small text-tertiary">
            {diagnostics?.internet === 'online'
              ? 'Provider details are momentarily unavailable.'
              : 'Provider details are unavailable offline.'}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

export function DiagnosticsView() {
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

      {error && (
        <Banner
          variant="error"
          title={error}
          description={diagnostics ? 'Showing the last check.' : 'Try again in a moment.'}
          onRetry={run}
        />
      )}

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
