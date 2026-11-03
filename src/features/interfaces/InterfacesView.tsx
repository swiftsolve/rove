import { cva, cx } from 'class-variance-authority'

import { useNetworkInterfaces } from '@/features/interfaces/hooks/useNetworkInterfaces'
import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/lib/format'
import type { NetworkInterfaceSummary } from '@/types'
import {
  Banner,
  Button,
  Card,
  CardBody,
  DataList,
  DataRow,
  EthernetIcon,
  IconButton,
  IconTile,
  type IconTileColor,
  InlineMeta,
  LayersIcon,
  LoadingState,
  PageHeader,
  POLLING_DESCRIPTION,
  RefreshIcon,
  StatusDot,
  Tooltip,
  WifiIcon,
} from '@/ui'

// Wi-Fi and Ethernet colour the icon tile; anything else stays neutral.
const TILE_COLORS = {
  wifi: 'var(--series-down)',
  ethernet: 'var(--status-positive)',
  unknown: 'neutral',
} as const satisfies Record<string, IconTileColor>

/** A small tag beside the name ("Active", "Virtual"); the default route's turns green. */
const tagVariants = cva('type-caption', {
  variants: {
    isPositive: { true: 'text-positive', false: 'text-tertiary' },
  },
  defaultVariants: { isPositive: false },
})

/** The link state: green while up. */
const stateVariants = cva('type-caption inline-flex shrink-0 items-center gap-6 capitalize', {
  variants: {
    state: { up: 'text-positive', down: 'text-tertiary', unknown: 'text-tertiary' },
  },
})

// The bottom pad is trimmed: with no divider, header and body padding stacked
// into too big a gap below the name.
const PANEL_HEADER = cx(
  'flex items-center justify-between gap-12',
  'px-(--card-header-padding-x) pt-(--card-header-padding-y) pb-8',
)

function InterfaceIcon({ iface }: { iface: NetworkInterfaceSummary }) {
  if (iface.connectionType === 'wifi') return <WifiIcon size={15} />
  if (iface.connectionType === 'ethernet') return <EthernetIcon size={15} />
  return <LayersIcon size={15} />
}

function InterfacePanel({ iface }: { iface: NetworkInterfaceSummary }) {
  return (
    <Card as="li">
      <div className={PANEL_HEADER}>
        <div className="panel-head-main">
          <IconTile color={TILE_COLORS[iface.connectionType]} icon={<InterfaceIcon iface={iface} />} />
          {/* text-lg overrides type-heading-large's size to match the card titles. */}
          <h2 className="type-heading-large text-primary min-w-0 truncate text-lg">{iface.name}</h2>
          {iface.isDefault && (
            <Tooltip content="Used for internet traffic" shouldDescribe={false}>
              <span className={tagVariants({ isPositive: true })}>
                Active
                {/* The hint isn't announced here; say it for screen readers too. */}
                <span className="sr-only">, used for internet traffic</span>
              </span>
            </Tooltip>
          )}
          {iface.isVirtual && <span className={tagVariants()}>Virtual</span>}
        </div>
        <span className={stateVariants({ state: iface.operState })}>
          <StatusDot />
          {formatOperState(iface.operState)}
        </span>
      </div>

      <CardBody>
        <DataList density="compact">
          <DataRow label="Type" value={formatConnectionType(iface.connectionType)} />
          <DataRow label="Link speed" value={iface.speedMbps != null ? formatSpeedMbps(iface.speedMbps) : '—'} />
          <DataRow label="IP address" value={formatDisplayValue(iface.ipAddress)} />
          <DataRow label="MAC" value={formatMac(iface.macAddress)} />
        </DataList>
      </CardBody>
    </Card>
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
}) {
  if (isLoading && interfaces.length === 0) {
    return <LoadingState label="Loading network interfaces…" />
  }
  if (interfaces.length === 0) {
    return (
      <div className="page-empty">
        <p className="type-body-default text-tertiary">No network interfaces found.</p>
        <Button onClick={onRefresh}>Refresh</Button>
      </div>
    )
  }
  return (
    <ul role="list" aria-label="Network interfaces" aria-busy={isLoading} className="flex flex-col gap-10">
      {interfaces.map((iface) => (
        <InterfacePanel key={iface.name} iface={iface} />
      ))}
    </ul>
  )
}

export function InterfacesView() {
  const { interfaces, isLoading, error, refresh } = useNetworkInterfaces()
  const onRefresh = (): void => void refresh()

  return (
    <div className="page">
      <PageHeader
        icon={<LayersIcon size={18} />}
        title={headerTitle(interfaces.length)}
        description={
          interfaces.length > 0 ? (
            <InlineMeta shouldTruncate items={interfaceTypeSummaryParts(interfaces)} />
          ) : undefined
        }
        actions={<IconButton label="Refresh" icon={RefreshIcon} isLoading={isLoading} onClick={onRefresh} />}
      />

      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={refresh} />}

      <InterfacesBody interfaces={interfaces} isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  )
}
