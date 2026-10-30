import type { NetworkInterfaceSummary } from '@/types'
import { EthernetIcon, LayersIcon, WifiIcon } from '@/components/icons/Icons'
import { DataList, DataRow } from '@/components/DataRow'
import { InlineMeta } from '@/components/DotSeparator'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/lib/format'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { useNetworkInterfaces } from '@/features/interfaces/hooks/useNetworkInterfaces'
import { Button } from '@/components/Button'
import { SECTION_BODY, SECTION_CARD, SECTION_HEADER } from '@/components/Section'
import { ErrorBanner, POLLING_DESCRIPTION } from '@/components/ErrorBanner'

// Wi-Fi and Ethernet tint the icon tile; anything else stays neutral.
const ICON_TINT = 'bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-sm),transparent)]'

const iconVariants = cva('flex size-[32px] shrink-0 items-center justify-center rounded-sm', {
  variants: {
    connection: {
      wifi: ['text-series-down', ICON_TINT],
      ethernet: ['text-status-positive', ICON_TINT],
      unknown: 'bg-inset text-secondary',
    },
  },
})

/** A small tag beside the name ("Active", "Virtual"); the default route's turns green. */
const tagVariants = cva('text-meta', {
  variants: {
    isPositive: { true: 'text-positive' },
  },
})

/** The link state: green while up. */
const stateVariants = cva('text-meta inline-flex shrink-0 items-center gap-6 capitalize', {
  variants: {
    state: { up: 'text-positive', down: null, unknown: null },
  },
})

// Interface cards are entity headers (icon tile + name), like the connection
// card, so they need more room around the tile than a plain section title. The
// bottom pad is trimmed: with no divider, the header pad and body pad stacked
// into too big a gap below the name. No divider either: the card reads as one unit.
const PANEL_HEADER = cn(
  SECTION_HEADER,
  'h-auto border-b-0',
  'px-(--section-header-padding-x) pt-(--section-header-padding-y) pb-8',
)

// With no divider the header sets most of the gap above the fields; a small top
// pad adds a little room between the name and the first label. The rows carry
// only a few fields, so they tighten from the default 8px to 4px. The first
// row's top and the last row's bottom stay at 0 (row-list, DataRow).
const PANEL_BODY = cn(
  SECTION_BODY,
  'row-list pt-6',
  '*:not-first:pt-4 *:not-last:pb-4',
)

function InterfaceIcon({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  if (iface.connectionType === 'wifi') return <WifiIcon size={15} />
  if (iface.connectionType === 'ethernet') return <EthernetIcon size={15} />
  return <LayersIcon size={15} />
}

function InterfacePanel({ iface }: { iface: NetworkInterfaceSummary }): JSX.Element {
  return (
    <li className={SECTION_CARD}>
      <div className={PANEL_HEADER}>
        <div className="panel-head-main">
          <span className={iconVariants({ connection: iface.connectionType })}>
            <InterfaceIcon iface={iface} />
          </span>
          {/* text-lg: the widget-title size (e.g. "Traffic"), not text-title's larger one. */}
          <h2 className="text-title min-w-0 truncate text-lg">{iface.name}</h2>
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
          <span className="size-[5px] rounded-full bg-current" aria-hidden />
          {formatOperState(iface.operState)}
        </span>
      </div>

      <DataList className={PANEL_BODY}>
        <DataRow label="Type" value={formatConnectionType(iface.connectionType)} />
        <DataRow
          label="Link speed"
          value={iface.speedMbps != null ? formatSpeedMbps(iface.speedMbps) : '—'}
        />
        <DataRow label="IP address" value={formatDisplayValue(iface.ipAddress)} />
        <DataRow label="MAC" value={formatMac(iface.macAddress)} />
      </DataList>
    </li>
  )
}

// Keep the header subtitle's metadata on one line. Only once it's an
// .inline-meta row (2+ items); a single item stays a plain span.
const HEADER_SUB = '[&.inline-meta]:flex [&.inline-meta]:overflow-hidden [&.inline-meta]:whitespace-nowrap'

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
      <div className="page-empty" role="status">
        <Spinner />
        <p className="text-muted">Loading network interfaces…</p>
      </div>
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
      <ViewHeader
        icon={<LayersIcon size={18} />}
        title={headerTitle(interfaces.length)}
        subtitle={
          interfaces.length > 0 ? (
            <InlineMeta className={HEADER_SUB} items={interfaceTypeSummaryParts(interfaces)} />
          ) : undefined
        }
        actions={<RefreshIconButton label="Refresh" isBusy={isLoading} onClick={onRefresh} />}
      />

      {error && <ErrorBanner title={error} description={POLLING_DESCRIPTION} onRetry={refresh} />}

      <InterfacesBody interfaces={interfaces} isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  )
}
