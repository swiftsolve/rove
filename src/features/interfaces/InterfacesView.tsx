import type { NetworkInterfaceSummary } from '@/types'
import { EthernetIcon, LayersIcon, WifiIcon } from '@/components/icons/Icons'
import { DataRow } from '@/components/DataRow'
import { InlineMeta } from '@/components/DotSeparator'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/lib/format'
import { cx } from '@/lib/cx'
import { useAppData } from '@/app/hooks/useAppData'
import styles from './InterfacesView.module.css'

function InterfaceIcon({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  if (iface.connectionType === 'wifi') return <WifiIcon size={15} />
  if (iface.connectionType === 'ethernet') return <EthernetIcon size={15} />
  return <LayersIcon size={15} />
}

function InterfacePanel({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  return (
    <section
      className={cx('ui-section', styles.panel, iface.isDefault && styles.isDefault)}
      data-connection={iface.connectionType}
    >
      <header className="ui-section-header">
        <div className="panel-head-main">
          <span className={styles.icon}>
            <InterfaceIcon iface={iface} />
          </span>
          <span className={cx('text-title', styles.name)}>{iface.name}</span>
          {iface.isDefault && (
            <span className={cx('text-meta', styles.tag)} title="Used for internet traffic">
              Active
            </span>
          )}
          {iface.isVirtual && <span className={cx('text-meta', styles.tag, styles.isMuted)}>Virtual</span>}
        </div>
        <span className={cx('text-meta', styles.state)} data-state={iface.operState}>
          <span className={styles.stateDot} aria-hidden />
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
        <DataRow label="MAC" value={formatMac(iface.macAddress)} />
      </div>
    </section>
  )
}

/** Per-category counts, e.g. ["1 Wi‑Fi", "1 Ethernet", "2 Virtual"]. */
function interfaceTypeSummaryParts(interfaces: NetworkInterfaceSummary[]): string[] {
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

/** "2 interfaces" once some are listed, else the plain page name. */
function headerTitle(count: number): string {
  if (count === 0) return 'Interfaces'
  return `${count} ${count === 1 ? 'interface' : 'interfaces'}`
}

/** The page body: a first-load spinner, an empty state with a retry, or the
 *  interface panels. */
function InterfacesBody({
  interfaces,
  isLoading,
  onRefresh,
}: {
  interfaces: NetworkInterfaceSummary[]
  isLoading: boolean
  onRefresh: () => void
}): JSX.Element {
  if (isLoading && interfaces.length === 0) {
    return (
      <div className="view-empty">
        <Spinner />
        <p className="text-muted">Loading network interfaces…</p>
      </div>
    )
  }
  if (interfaces.length === 0) {
    return (
      <div className="view-empty">
        <p className="text-muted">No network interfaces found.</p>
        <button type="button" className="btn-secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    )
  }
  return (
    <div className={styles.list}>
      {interfaces.map((iface) => (
        <InterfacePanel key={iface.name} iface={iface} />
      ))}
    </div>
  )
}

export function InterfacesView(): JSX.Element {
  const { interfaces, isLoading, error, refresh } = useAppData().screens.interfaces
  const onRefresh = (): void => void refresh()

  return (
    <div className="view-page">
      <ViewHeader
        icon={<LayersIcon size={18} />}
        title={headerTitle(interfaces.length)}
        subtitle={
          interfaces.length > 0 ? (
            <InlineMeta className={styles.headerSub} items={interfaceTypeSummaryParts(interfaces)} />
          ) : undefined
        }
        actions={<RefreshIconButton label="Refresh" isBusy={isLoading} onClick={onRefresh} />}
      />

      {error && <div className="error-banner">{error}</div>}

      <InterfacesBody interfaces={interfaces} isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  )
}
