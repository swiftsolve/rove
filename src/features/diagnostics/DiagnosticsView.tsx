import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import type { IspInfo, NetworkDiagnostics, PingStats } from '@/types'
import { FAILED_PING, getLinkCapacityMbps } from '@/types'
import { DataRow } from '@/components/DataRow'
import { Section } from '@/components/Section'
import { ConnectionIcon, DnsIcon, GlobeIcon, RouterIcon } from '@/components/icons/Icons'
import { MetricValue, type MetricLevel } from '@/components/MetricValue'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { ServiceIcon } from '@/components/icons/ServiceIcon'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { useAppData } from '@/app/hooks/useAppData'
import styles from './DiagnosticsView.module.css'

/** Gateway round trips up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 40
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 120
/** Any packet loss is worth flagging; past this it reads as bad, not just amber. */
const WARN_LOSS_MAX_PCT = 2

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
  if (isRunning) return <span className="view-header-status">Checking…</span>
  if (hasDiagnostics) return 'Router, DNS, and ISP'
  return <span className="view-header-status">&nbsp;</span>
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
  const { info } = useAppData().network
  const ping = diagnostics?.gatewayPing
  // Negotiated link rate of the local connection to the router (Wi-Fi/Ethernet),
  // or null when disconnected or the OS doesn't report it.
  const linkSpeedMbps = info ? getLinkCapacityMbps(info) : null

  return (
    <Section
      title="Router"
      className={styles.routerSection}
      icon={<RouterIcon size={15} />}
      bodyClassName={cx('row-list', styles.tightRows)}
      bodyAs="dl"
      footer={
        ping && ping.packetLoss > 0 ? (
          <p className={cx('text-small', styles.warning)}>
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
      <DataRow label="Latency">{latencyValue(ping)}</DataRow>
      <DataRow label="Jitter">{jitterValue(ping)}</DataRow>
      <DataRow label="Packet loss">
        {ping ? (
          <MetricValue value={ping.packetLoss} level={lossLevel(ping.packetLoss)} format={formatPercent} />
        ) : (
          '—'
        )}
      </DataRow>
    </Section>
  )
}

function DnsSection({ servers }: { servers: string[] }): JSX.Element {
  return (
    <Section
      title="DNS"
      icon={<DnsIcon size={15} />}
      bodyClassName={cx('row-list', styles.dnsRows)}
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
  if (isp?.isVpn) return <span className="ui-section-badge">VPN</span>
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
      bodyClassName={cx('row-list', styles.tightRows)}
      bodyAs={isp ? 'dl' : 'div'}
      action={ispBadge(isp)}
    >
      {isp ? (
        <>
          {/* Under a VPN these rows describe the exit node, so the first row is
              "Provider" — the value (the exit's hosting company) is correct, only
              the "ISP" label would lie. The remaining rows stay accurate as-is. */}
          <DataRow label={isp.isVpn ? 'Provider' : 'ISP'} value={isp.name} />
          <DataRow label="ASN" value={isp.asn} />
          {/* "Website", not "Domain" — in a network tool the latter reads
              as a DHCP search domain. DataRow hides itself when null, so
              a lookup that named no domain simply has no row. */}
          <DataRow label="Website" value={isp.domain} />
          <DataRow label="Location" value={formatLocation(isp)} />
          <DataRow label="Public IP" value={isp.publicIp} />
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
  const { diagnostics, isRunning, error, run } = useAppData().screens.diagnostics
  const runDiagnostics = (): void => {
    void run()
  }
  const hasDiagnostics = diagnostics != null
  const isFirstCheck = isRunning && !diagnostics

  return (
    <div className="view-page">
      <ViewHeader
        icon={<ConnectionIcon size={18} />}
        title="Connection"
        subtitle={headerSubtitle(isRunning, hasDiagnostics)}
        isSubtitleShown={hasDiagnostics && !isRunning}
        actions={<RefreshIconButton label="Run again" isBusy={isRunning} onClick={runDiagnostics} />}
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
        <div className="view-empty" aria-busy="true">
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
