import type { IspInfo, NetworkDiagnostics } from '@/types'
import { FAILED_PING } from '@/types'
import DataRow from '@/components/ui/DataRow'
import Section from '@/components/ui/Section'
import { ConnectionIcon, DnsIcon, GlobeIcon, RouterIcon } from '@/components/ui/Icons'
import { MetricValue } from '@/components/ui/MetricValue'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import { RefreshIconButton } from '@/components/ui/RefreshIconButton'
import { Spinner } from '@/components/ui/Spinner'
import { ViewHeader } from '@/components/ui/ViewHeader'
import './DiagnosticsView.css'

interface DiagnosticsViewProps {
  readonly diagnostics: NetworkDiagnostics | null
  /** Negotiated link rate of the local connection to the router (Wi-Fi/Ethernet),
   *  or null when disconnected or the OS doesn't report it. */
  readonly linkSpeedMbps: number | null
  readonly isRunning: boolean
  readonly error: string | null
  readonly onRun: () => void
}

function formatPercent(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

function latencyLevel(ms: number): string {
  if (!Number.isFinite(ms) || ms >= FAILED_PING.avgMs) return 'val-bad'
  if (ms <= 40) return 'val-good'
  if (ms <= 120) return 'val-warn'
  return 'val-bad'
}

function lossLevel(pct: number): string {
  if (pct <= 0) return 'val-good'
  if (pct <= 2) return 'val-warn'
  return 'val-bad'
}

function formatLocation(isp: IspInfo): string | null {
  const parts = [isp.city, isp.region, isp.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

export default function DiagnosticsView({
  diagnostics,
  linkSpeedMbps,
  isRunning,
  error,
  onRun,
}: DiagnosticsViewProps): JSX.Element {
  const ping = diagnostics?.gatewayPing
  const hasDiagnostics = diagnostics != null

  return (
    <div className="view-page">
      <ViewHeader
        icon={<ConnectionIcon size={18} />}
        title="Connection"
        subtitle={
          isRunning ? (
            <span className="view-header-status">Checking…</span>
          ) : hasDiagnostics ? (
            'Router, DNS, and ISP'
          ) : (
            <span className="view-header-status">&nbsp;</span>
          )
        }
        subtitleShown={hasDiagnostics && !isRunning}
        actions={<RefreshIconButton label="Run again" isBusy={isRunning} onClick={onRun} />}
      />

      {error && <div className="error-banner">{error}</div>}

      {isRunning && !diagnostics ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Checking your connection…</p>
        </div>
      ) : (
        <>
          <Section
            title="Router"
            className="diag-router-section"
            icon={<RouterIcon size={15} />}
            bodyClassName="row-list diag-router"
            footer={
              ping && ping.packetLoss > 0 ? (
                <p className="text-hint diag-warning">
                  Packet loss can cause slow or unstable connections.
                </p>
              ) : undefined
            }
          >
            <DataRow label="Interface" value={diagnostics?.defaultInterface ?? '—'} />
            <DataRow label="Gateway" value={diagnostics?.gateway ?? '—'} />
            {diagnostics?.gatewayName && (
              <DataRow label="Name" value={diagnostics.gatewayName} />
            )}
            {diagnostics?.gatewayVendor && (
              <DataRow label="Vendor" value={diagnostics.gatewayVendor} />
            )}
            {diagnostics?.gatewayModel && (
              <DataRow label="Model" value={diagnostics.gatewayModel} />
            )}
            {linkSpeedMbps != null && (
              <DataRow label="Link speed">
                <MetricValue value={linkSpeedMbps} format={formatSpeedMbps} />
              </DataRow>
            )}
            <DataRow label="Latency">
              {ping == null ? (
                '—'
              ) : ping.avgMs >= FAILED_PING.avgMs ? (
                <span className="val-bad">Down</span>
              ) : (
                <MetricValue value={ping.avgMs} level={latencyLevel(ping.avgMs)} format={formatLatencyMs} />
              )}
            </DataRow>
            <DataRow label="Jitter">
              {ping == null ? (
                '—'
              ) : ping.jitterMs >= FAILED_PING.avgMs ? (
                'Down'
              ) : (
                <MetricValue value={ping.jitterMs} format={formatLatencyMs} />
              )}
            </DataRow>
            <DataRow label="Packet loss">
              {ping ? (
                <MetricValue value={ping.packetLoss} level={lossLevel(ping.packetLoss)} format={formatPercent} />
              ) : (
                '—'
              )}
            </DataRow>
          </Section>

          <Section title="DNS" icon={<DnsIcon size={15} />} bodyClassName="row-list diag-dns">
            {(diagnostics?.dnsServers?.length ?? 0) > 0 ? (
              (diagnostics?.dnsServers ?? []).map((server) => (
                <DataRow key={server} label="Server" value={server} />
              ))
            ) : (
              <p className="text-hint">No DNS servers found.</p>
            )}
          </Section>

          <Section
            title="ISP"
            icon={<GlobeIcon size={15} />}
            bodyClassName="row-list diag-router"
          >
            {diagnostics?.isp ? (
              <>
                <DataRow label="ISP" value={diagnostics.isp.name} />
                <DataRow label="ASN" value={diagnostics.isp.asn} />
                <DataRow label="Location" value={formatLocation(diagnostics.isp)} />
                <DataRow label="Public IP" value={diagnostics.isp.publicIp} />
              </>
            ) : (
              <p className="text-hint">Provider details are unavailable offline.</p>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
