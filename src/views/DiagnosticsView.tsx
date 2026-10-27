import type { IspInfo, NetworkDiagnostics } from '@/types'
import { FAILED_PING } from '@/types'
import DataRow from '@/components/ui/DataRow'
import Section from '@/components/ui/Section'
import { ConnectionIcon, DnsIcon, GlobeIcon, RouterIcon } from '@/components/ui/Icons'
import { MetricValue } from '@/components/ui/MetricValue'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import { RefreshIconButton } from '@/components/ui/RefreshIconButton'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { Spinner } from '@/components/ui/Spinner'
import { ViewHeader } from '@/components/ui/ViewHeader'
import './DiagnosticsView.css'

interface DiagnosticsViewProps {
  diagnostics: NetworkDiagnostics | null
  /** Negotiated link rate of the local connection to the router (Wi-Fi/Ethernet),
   *  or null when disconnected or the OS doesn't report it. */
  linkSpeedMbps: number | null
  isRunning: boolean
  error: string | null
  onRun: () => void
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
        isSubtitleShown={hasDiagnostics && !isRunning}
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
                <p className="text-small diag-warning">
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
              <p className="text-small">No DNS servers found.</p>
            )}
          </Section>

          <Section
            title={diagnostics?.isp?.isVpn ? 'VPN' : 'ISP'}
            icon={<GlobeIcon size={15} />}
            bodyClassName="row-list diag-router"
            // The right-hand slot: a small "VPN" pill when our egress is a
            // hosting/datacenter ASN (these rows then describe the exit node, not
            // the real ISP), otherwise the brand mark — but only if one actually
            // resolves. Plenty of ISPs have no favicon (Comcast, for one), and a
            // lone letter here would read as a glitch rather than a brand, so this
            // slot stays empty rather than falling back to a monogram. A VPN exit
            // has no brand domain, so the two never contend for the slot.
            action={
              diagnostics?.isp?.isVpn ? (
                <span className="ui-section-badge">VPN</span>
              ) : diagnostics?.isp?.domain ? (
                <ServiceIcon
                  host={diagnostics.isp.domain}
                  name={diagnostics.isp.name ?? 'ISP'}
                  size={18}
                  fallback="none"
                />
              ) : undefined
            }
          >
            {diagnostics?.isp ? (
              <>
                {/* Under a VPN these rows describe the exit node, not the real
                    ISP, so the first row is "Provider" — the value (the exit's
                    hosting company) is correct, only the "ISP" label would lie.
                    The remaining rows stay accurate as-is (see title comment). */}
                <DataRow
                  label={diagnostics.isp.isVpn ? 'Provider' : 'ISP'}
                  value={diagnostics.isp.name}
                />
                <DataRow label="ASN" value={diagnostics.isp.asn} />
                {/* "Website", not "Domain" — in a network tool the latter reads
                    as a DHCP search domain. DataRow hides itself when null, so
                    a lookup that named no domain simply has no row. */}
                <DataRow label="Website" value={diagnostics.isp.domain} />
                <DataRow label="Location" value={formatLocation(diagnostics.isp)} />
                <DataRow label="Public IP" value={diagnostics.isp.publicIp} />
              </>
            ) : (
              // The card resolves ISP/ASN/country on-device now, so it only lands
              // here when we couldn't even learn our own public IP — i.e. offline.
              // Guard the copy on the known internet state anyway, so a transient
              // echo-service blip while online doesn't claim we're offline.
              <p className="text-small">
                {diagnostics?.internet === 'online'
                  ? 'Provider details are momentarily unavailable.'
                  : 'Provider details are unavailable offline.'}
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
