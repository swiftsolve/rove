import type { NetworkInterfaceSummary } from '@/types'
import {
  Button,
  Card,
  CardBody,
  DataList,
  DataRow,
  Banner,
  EthernetIcon,
  IconButton,
  IconTile,
  InlineMeta,
  LayersIcon,
  LoadingState,
  PageHeader,
  POLLING_DESCRIPTION,
  RefreshIcon,
  StatusDot,
  WifiIcon,
  type IconTileColor,
} from '@/ui'
import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/lib/format'
import { cva, cx } from 'class-variance-authority'
import { useNetworkInterfaces } from '@/features/interfaces/hooks/useNetworkInterfaces'

// Wi-Fi and Ethernet colour the icon tile; anything else stays neutral.
const TILE_COLORS = { wifi: 'var(--series-down)', ethernet: 'var(--status-positive)', unknown: 'neutral' } as const satisfies Record<
  string,
  IconTileColor
>

/** A small tag beside the name ("Active", "Virtual"); the default route's turns green. */
const tagVariants = cva('text-caption', {
  variants: {
    isPositive: { true: 'text-positive' },
  },
})

/** The link state: green while up. */
const stateVariants = cva('text-caption inline-flex shrink-0 items-center gap-6 capitalize', {
  variants: {
    state: { up: 'text-positive', down: null, unknown: null },
  },
})

// Interface cards are entity headers (icon tile + name), like the connection
// card, so they need more room around the tile than a plain card title. The
// bottom pad is trimmed: with no divider, the header pad and body pad stacked
// into too big a gap below the name. No divider either: the card reads as one unit.
const PANEL_HEADER = cx(
  'flex items-center justify-between gap-12',
  'px-(--card-header-padding-x) pt-(--card-header-padding-y) pb-8',
)

// With no divider the header sets most of the gap above the fields; a small top
// pad adds a little room between the name and the first label. The rows carry
// only a few fields, so they're compact.

function InterfaceIcon({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  if (iface.connectionType === 'wifi') return <WifiIcon size={15} />
  if (iface.connectionType === 'ethernet') return <EthernetIcon size={15} />
  return <LayersIcon size={15} />
}

function InterfacePanel({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  return (
    <Card as="li">
      <div className={PANEL_HEADER}>
        <div className="panel-head-main">
          <IconTile
            color={TILE_COLORS[iface.connectionType]}
            icon={<InterfaceIcon iface={iface} />}
          />
          {/* text-lg: the widget-title size (e.g. "Traffic"), not text-heading-large's larger one. */}
          <h2 className="text-heading-large min-w-0 truncate text-lg">{iface.name}</h2>
          {iface.isDefault && (
            <span className={tagVariants({ isPositive: true })} title="Used for internet traffic">
              Active
              {/* The hover title isn't announced; say it for screen readers too. */}
              <span className="sr-only">, used for internet traffic</span>
            </span>
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
          <DataRow
            label="Link speed"
            value={iface.speedMbps != null ? formatSpeedMbps(iface.speedMbps) : '—'}
          />
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
}): JSX.Element {
  if (isLoading && interfaces.length === 0) {
    return (
      <LoadingState label="Loading network interfaces…" />
    )
  }
  if (interfaces.length === 0) {
    return (
      <div className="page-empty">
        <p className="text-muted">No network interfaces found.</p>
        <Button onClick={onRefresh}>
          Refresh
        </Button>
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

export function InterfacesView(): JSX.Element {
  const { interfaces, isLoading, error, refresh } = useNetworkInterfaces()
  const onRefresh = (): void => void refresh()

  return (
    <div className="page">
      <PageHeader
        icon={<LayersIcon size={18} />}
        title={headerTitle(interfaces.length)}
        description={
          interfaces.length > 0 ? (
            // One line, so a long summary ellipsizes rather than wrapping.
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
