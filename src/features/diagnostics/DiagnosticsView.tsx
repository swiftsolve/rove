import type { ReactNode } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { useDiagnostics } from '@/features/diagnostics/hooks/useDiagnostics'
import {
  formatLocation,
  formatPercent,
  latencyStatus,
  lossStatus,
  runStatusText,
  sameText,
} from '@/features/diagnostics/utils/diagnostics-display'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import type { IspInfo, NetworkDiagnostics, PingStats } from '@/types'
import { getLinkCapacityMbps, isMeasuredLatency } from '@/types'
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
  MetricValue,
  PageHeader,
  RefreshIcon,
  RouterIcon,
} from '@/ui'

const DIAGNOSTICS_HINT =
  'Latency pings your router, and some routers answer slowly on purpose. ISP details come from your public IP.'

function latencyValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return '—'
  if (!isMeasuredLatency(ping.avgMs)) return <span className="text-negative">Down</span>
  return <MetricValue value={ping.avgMs} status={latencyStatus(ping.avgMs)} format={formatLatencyMs} />
}

function jitterValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return '—'
  if (!isMeasuredLatency(ping.jitterMs)) return 'Down'
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
