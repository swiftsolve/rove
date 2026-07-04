import type { NetworkDiagnostics } from '@shared/types'
import { FAILED_PING } from '@shared/types'
import DataRow from '../components/ui/DataRow'
import Section from '../components/ui/Section'
import { DnsIcon, RefreshIcon, RouterIcon } from '../components/Icons'
import { formatLatencyMs } from '../utils/format'
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

  return (
    <div className="view-page">
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
            bodyClassName={isRunning ? 'is-loading row-list' : 'row-list'}
            action={
              <button
                type="button"
                className="btn-icon btn-icon-secondary"
                onClick={onRun}
                disabled={isRunning}
                title="Test again"
                aria-label="Test again"
              >
                {isRunning ? <span className="btn-spinner" /> : <RefreshIcon size={16} />}
              </button>
            }
          >
            {isRunning && (
              <div className="section-loading">
                <div className="spinner" />
              </div>
            )}
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
            {diagnostics?.dnsServers.length ? (
              diagnostics.dnsServers.map((server) => (
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
