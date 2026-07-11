import type { NetworkDiagnostics } from '@/types'
import { FAILED_PING } from '@/types'
import DataRow from '@/components/ui/DataRow'
import Section from '@/components/ui/Section'
import { ConnectionIcon, DnsIcon, RouterIcon } from '@/components/ui/Icons'
import { formatLatencyMs } from '@/lib/format'
import { RefreshIconButton } from '@/components/ui/RefreshIconButton'
import { Spinner } from '@/components/ui/Spinner'
import { ViewHeader } from '@/components/ui/ViewHeader'
import './DiagnosticsView.css'

interface DiagnosticsViewProps {
  readonly diagnostics: NetworkDiagnostics | null
  readonly isRunning: boolean
  readonly error: string | null
  readonly onRun: () => void
}

function formatPing(ms: number): string {
  if (!Number.isFinite(ms) || ms >= FAILED_PING.avgMs) return 'Unreachable'
  return formatLatencyMs(ms)
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

export default function DiagnosticsView({
  diagnostics,
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
            'Router latency and DNS servers'
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
            {diagnostics?.gatewayVendor && (
              <DataRow label="Vendor" value={diagnostics.gatewayVendor} />
            )}
            {diagnostics?.gatewayModel && (
              <DataRow label="Model" value={diagnostics.gatewayModel} />
            )}
            <DataRow label="Latency">
              {ping ? (
                <span className={latencyLevel(ping.avgMs)}>{formatPing(ping.avgMs)}</span>
              ) : (
                '—'
              )}
            </DataRow>
            <DataRow label="Jitter" value={ping ? formatPing(ping.jitterMs) : '—'} />
            <DataRow label="Packet loss">
              {ping ? (
                <span className={lossLevel(ping.packetLoss)}>{ping.packetLoss}%</span>
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
        </>
      )}
    </div>
  )
}
