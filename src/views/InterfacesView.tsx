import type { NetworkInterfaceSummary } from '@/types'
import { EthernetIcon, LayersIcon, RefreshIcon, WifiIcon } from '@/components/ui/Icons'
import DataRow from '@/components/ui/DataRow'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { Tooltip } from '@/components/ui/Tooltip'
import { Spinner } from '@/components/ui/Spinner'
import { formatConnectionType, formatDisplayValue, formatOperState, formatSpeedMbps } from '@/lib/format'
import './InterfacesView.css'

interface InterfacesViewProps {
  readonly interfaces: readonly NetworkInterfaceSummary[]
  readonly isLoading: boolean
  readonly error: string | null
  readonly onRefresh: () => void
}

function InterfaceIcon({ iface }: { readonly iface: NetworkInterfaceSummary }): JSX.Element {
  if (iface.connectionType === 'wifi') return <WifiIcon size={15} />
  if (iface.connectionType === 'ethernet') return <EthernetIcon size={15} />
  return <LayersIcon size={15} />
}

function InterfacePanel({ iface }: { readonly iface: NetworkInterfaceSummary }): JSX.Element {
  return (
    <section
      className={`ui-section iface-panel ${iface.connectionType} ${iface.isDefault ? 'default' : ''}`}
    >
      <header className="ui-section-header">
        <div className="panel-head-main">
          <span className="iface-panel-icon">
            <InterfaceIcon iface={iface} />
          </span>
          <span className="text-title iface-panel-name">{iface.name}</span>
          {iface.isDefault && (
            <span className="text-meta iface-tag" title="Used for internet traffic">
              Active
            </span>
          )}
          {iface.isVirtual && <span className="text-meta iface-tag muted">Virtual</span>}
        </div>
        <span className={`text-meta iface-state ${iface.operState}`}>
          <span className="iface-state-dot" aria-hidden />
          {formatOperState(iface.operState)}
        </span>
      </header>

      <div className="ui-section-body row-list">
        <DataRow label="Type" value={formatConnectionType(iface.connectionType)} />
        <DataRow label="IP address" value={formatDisplayValue(iface.ipAddress)} />
        <DataRow
          label="Link speed"
          value={iface.speedMbps != null ? formatSpeedMbps(iface.speedMbps) : '—'}
        />
        <DataRow label="MAC" value={formatDisplayValue(iface.macAddress)} />
      </div>
    </section>
  )
}

/** Per-category counts, e.g. ["1 Wi‑Fi", "1 Ethernet", "2 Virtual"]. */
function interfaceTypeSummaryParts(interfaces: readonly NetworkInterfaceSummary[]): string[] {
  const counts = { wifi: 0, ethernet: 0, virtual: 0, other: 0 }
  for (const iface of interfaces) {
    if (iface.isVirtual) counts.virtual++
    else if (iface.connectionType === 'wifi') counts.wifi++
    else if (iface.connectionType === 'ethernet') counts.ethernet++
    else counts.other++
  }

  const parts: string[] = []
  if (counts.wifi > 0) parts.push(`${counts.wifi} Wi‑Fi`)
  if (counts.ethernet > 0) parts.push(`${counts.ethernet} Ethernet`)
  if (counts.virtual > 0) parts.push(`${counts.virtual} Virtual`)
  if (counts.other > 0) parts.push(`${counts.other} Other`)
  return parts
}

export default function InterfacesView({
  interfaces,
  isLoading,
  error,
  onRefresh,
}: InterfacesViewProps): JSX.Element {
  const refreshing = isLoading && interfaces.length > 0

  return (
    <div className="view-page">
      <div className="view-header iface-header">
        <span className="view-header-icon">
          <LayersIcon size={18} />
        </span>
        <div className="iface-header-text">
          <span className="view-header-title">
            {interfaces.length > 0
              ? `${interfaces.length} ${interfaces.length === 1 ? 'interface' : 'interfaces'}`
              : 'Interfaces'}
          </span>
          {interfaces.length > 0 && (
            <InlineMeta
              className="iface-header-sub"
              items={interfaceTypeSummaryParts(interfaces)}
            />
          )}
        </div>
        <Tooltip content="Refresh">
          <button
            type="button"
            className="btn-icon btn-icon-secondary"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh"
          >
            {refreshing ? <span className="btn-spinner" /> : <RefreshIcon size={16} />}
          </button>
        </Tooltip>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {isLoading && interfaces.length === 0 ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Loading network interfaces…</p>
        </div>
      ) : interfaces.length === 0 ? (
        <div className="view-empty">
          <p className="text-muted">No network interfaces found.</p>
          <button type="button" className="btn-secondary" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      ) : (
        <div className="interface-list">
          {interfaces.map((iface) => (
            <InterfacePanel key={iface.name} iface={iface} />
          ))}
        </div>
      )}
    </div>
  )
}
