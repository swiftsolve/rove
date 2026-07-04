import type { NetworkInterfaceSummary } from '@shared/types'
import { EthernetIcon, LayersIcon, RefreshIcon, WifiIcon } from '../components/Icons'
import DataRow from '../components/ui/DataRow'
import { formatConnectionType, formatDisplayValue, formatOperState, formatSpeedMbps } from '../utils/format'
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

export default function InterfacesView({
  interfaces,
  isLoading,
  error,
  onRefresh,
}: InterfacesViewProps): JSX.Element {
  const refreshing = isLoading && interfaces.length > 0

  return (
    <div className="view-page">
      <div className="view-toolbar">
        <span className="text-meta">
          {interfaces.length > 0 &&
            `${interfaces.length} ${interfaces.length === 1 ? 'interface' : 'interfaces'}`}
        </span>
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh"
          aria-label="Refresh"
        >
          {refreshing ? <span className="btn-spinner" /> : <RefreshIcon size={16} />}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {isLoading && interfaces.length === 0 ? (
        <div className="view-empty">
          <div className="spinner" />
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
