import type { NetworkDiagnostics } from '@/types'
import { FAILED_PING } from '@/types'
import DataRow from '@/components/ui/DataRow'
import Section from '@/components/ui/Section'
import { Tooltip } from '@/components/ui/Tooltip'
import { ConnectionIcon, DnsIcon, RefreshIcon, RouterIcon } from '@/components/ui/Icons'
import { formatLatencyMs } from '@/lib/format'
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
  const refreshing = isRunning && hasDiagnostics

  return (
    <div className="view-page">
      <div className="view-header diag-header">
        <span className="view-header-icon">
          <ConnectionIcon size={18} />
        </span>
        <div className="diag-header-text">
          <span className="view-header-title">Connection</span>
          <span className={`diag-header-sub${hasDiagnostics && !isRunning ? ' show' : ''}`}>
            {isRunning ? (
              <span className="diag-header-status">Checking…</span>
            ) : hasDiagnostics ? (
              'Router latency and DNS servers'
            ) : (
              <span className="diag-header-status">&nbsp;</span>
            )}
          </span>
        </div>
        <div className="diag-header-actions">
          <Tooltip content="Run again">
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              onClick={onRun}
              disabled={isRunning}
              aria-label="Run again"
            >
              {refreshing ? <span className="btn-spinner" /> : <RefreshIcon size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {isRunning && !diagnostics ? (
        <div className="view-empty">
          <div className="spinner" />
          <p className="text-muted">Checking your connection…</p>
        </div>
      ) : (
        <>
          <Section
            title="Router"
            icon={<RouterIcon size={15} />}
            bodyClassName="row-list diag-router"
          >
            <DataRow label="Interface" value={diagnostics?.defaultInterface ?? '—'} />
            <DataRow label="Gateway" value={diagnostics?.gateway ?? '—'} />
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
            {ping && ping.packetLoss > 0 && (
              <p className="text-hint diag-warning">
                Packet loss can cause slow or unstable connections.
              </p>
            )}
          </Section>

          <Section title="DNS" icon={<DnsIcon size={15} />} bodyClassName="row-list">
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
