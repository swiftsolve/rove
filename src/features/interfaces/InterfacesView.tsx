import type { NetworkInterfaceSummary } from '@/types'
import { EthernetIcon, LayersIcon, WifiIcon } from '@/components/icons/Icons'
import { DataList, DataRow } from '@/components/DataRow'
import { InlineMeta } from '@/components/DotSeparator'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/lib/format'
import { cva, cx } from 'class-variance-authority'
import { useNetworkInterfaces } from '@/features/interfaces/hooks/useNetworkInterfaces'
import { Button } from '@/components/Button'
import styles from './InterfacesView.module.css'

/** An interface card: the default route's tags turn green, and Wi-Fi and Ethernet tint the icon. */
const panelVariants = cva(['ui-section', styles.panel], {
  variants: {
    isDefault: { true: styles.isDefault },
    connection: { wifi: styles.connectionWifi, ethernet: styles.connectionEthernet, unknown: null },
  },
})

/** A small tag beside the name ("Active", "Virtual"). */
const tagVariants = cva(['text-meta', styles.tag], {
  variants: {
    isMuted: { true: styles.isMuted },
  },
})

/** The link state: green while up. */
const stateVariants = cva(['text-meta', styles.state], {
  variants: {
    state: { up: styles.stateUp, down: null, unknown: null },
  },
})

function InterfaceIcon({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  if (iface.connectionType === 'wifi') return <WifiIcon size={15} />
  if (iface.connectionType === 'ethernet') return <EthernetIcon size={15} />
  return <LayersIcon size={15} />
}

function InterfacePanel({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  return (
    <li className={panelVariants({ isDefault: iface.isDefault, connection: iface.connectionType })}>
      <div className="ui-section-header">
        <div className="panel-head-main">
          <span className={styles.icon}>
            <InterfaceIcon iface={iface} />
          </span>
          <h2 className={cx('text-title', styles.name)}>{iface.name}</h2>
          {iface.isDefault && (
            <span className={tagVariants()} title="Used for internet traffic">
              Active
              {/* The hover title isn't announced; say it for screen readers too. */}
              <span className="sr-only">, used for internet traffic</span>
            </span>
          )}
          {iface.isVirtual && <span className={tagVariants({ isMuted: true })}>Virtual</span>}
        </div>
        <span className={stateVariants({ state: iface.operState })}>
          <span className={styles.stateDot} aria-hidden />
          {formatOperState(iface.operState)}
        </span>
      </div>

      <DataList className="ui-section-body row-list">
        <DataRow label="Type" value={formatConnectionType(iface.connectionType)} />
        <DataRow label="IP address" value={formatDisplayValue(iface.ipAddress)} />
        <DataRow
          label="Link speed"
          value={iface.speedMbps != null ? formatSpeedMbps(iface.speedMbps) : '—'}
        />
        <DataRow label="MAC" value={formatMac(iface.macAddress)} />
      </DataList>
    </li>
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
      <div className="view-empty" role="status">
        <Spinner />
        <p className="text-muted">Loading network interfaces…</p>
      </div>
    )
  }
  if (interfaces.length === 0) {
    return (
      <div className="view-empty">
        <p className="text-muted">No network interfaces found.</p>
        <Button onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    )
  }
  return (
    <ul role="list" aria-label="Network interfaces" aria-busy={isLoading} className={styles.list}>
      {interfaces.map((iface) => (
        <InterfacePanel key={iface.name} iface={iface} />
      ))}
    </ul>
  )
}

export function InterfacesView(): JSX.Element {
  const { interfaces, isLoading, error, refresh } = useNetworkInterfaces()
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

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <InterfacesBody interfaces={interfaces} isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  )
}
