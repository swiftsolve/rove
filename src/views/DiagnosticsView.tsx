import type { IspInfo, NetworkDiagnostics } from '@/types'
import { FAILED_PING } from '@/types'
import DataRow from '@/components/ui/DataRow'
import Section from '@/components/ui/Section'
import {
  CloudIcon,
  ConnectionIcon,
  DnsIcon,
  GlobeIcon,
  HelpIcon,
  RouterIcon,
} from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import ShareWifiButton from '@/components/connection/ShareWifiButton'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import { useCountUp } from '@/hooks/useCountUp'
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
  /** Whether the active connection is Wi-Fi, gating the "Share Wi-Fi" action. */
  readonly canShareWifi: boolean
}

function formatPercent(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

/**
 * A numeric readout that eases toward its latest value each poll (up or down),
 * matching the Live Traffic readouts. On first paint it shows the value outright
 * — the ease only kicks in when a subsequent poll changes the number.
 */
function MetricValue({
  value,
  level,
  format,
}: {
  readonly value: number
  readonly level?: string
  readonly format: (n: number) => string
}): JSX.Element {
  const animated = useCountUp(value)
  return <span className={level}>{format(animated)}</span>
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

// Service reachability is a full TLS handshake to :443 (DNS + TCP + TLS), so its
// round-trips run well above a bare ICMP ping — roughly twice a plain connect for
// the extra handshake RTT. The bands are looser than `latencyLevel` to match. A
// null latency means the handshake never completed.
function serviceLevel(ms: number): string {
  if (ms <= 120) return 'val-good'
  if (ms <= 300) return 'val-warn'
  return 'val-bad'
}

function formatLocation(isp: IspInfo): string | null {
  const parts = [isp.city, isp.region, isp.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

const SERVICE_INFO_HINT =
  'Cloud service reachability, measured as the time to complete a secure (TLS) handshake with each service.'

export default function DiagnosticsView({
  diagnostics,
  linkSpeedMbps,
  isRunning,
  error,
  onRun,
  canShareWifi,
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
            'Router, services, DNS, and ISP'
          ) : (
            <span className="view-header-status">&nbsp;</span>
          )
        }
        subtitleShown={hasDiagnostics && !isRunning}
        actions={
          <>
            {canShareWifi && <ShareWifiButton />}
            <Tooltip content={SERVICE_INFO_HINT}>
              <button
                type="button"
                className="btn-icon btn-icon-secondary"
                aria-label="About service reachability"
              >
                <HelpIcon size={16} />
              </button>
            </Tooltip>
            <RefreshIconButton label="Run again" isBusy={isRunning} onClick={onRun} />
          </>
        }
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
                <span className="val-bad">Unreachable</span>
              ) : (
                <MetricValue value={ping.avgMs} level={latencyLevel(ping.avgMs)} format={formatLatencyMs} />
              )}
            </DataRow>
            <DataRow label="Jitter">
              {ping == null ? (
                '—'
              ) : ping.jitterMs >= FAILED_PING.avgMs ? (
                'Unreachable'
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

          <Section
            title="Services"
            icon={<CloudIcon size={15} />}
            bodyClassName="row-list diag-router"
          >
            {(diagnostics?.services?.length ?? 0) > 0 ? (
              (diagnostics?.services ?? []).map((service) => (
                <DataRow key={service.host} label={service.name}>
                  {service.latencyMs == null ? (
                    <span className="val-bad">Unreachable</span>
                  ) : (
                    <MetricValue
                      value={service.latencyMs}
                      level={serviceLevel(service.latencyMs)}
                      format={formatLatencyMs}
                    />
                  )}
                </DataRow>
              ))
            ) : (
              <p className="text-hint">No services were checked.</p>
            )}
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
