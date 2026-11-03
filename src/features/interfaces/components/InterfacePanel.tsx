import { cva, cx } from 'class-variance-authority'

import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/lib/format'
import type { NetworkInterfaceSummary } from '@/types'
import {
  Card,
  CardBody,
  DataList,
  DataRow,
  EthernetIcon,
  IconTile,
  type IconTileColor,
  LayersIcon,
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

export function InterfacePanel({ iface }: { iface: NetworkInterfaceSummary }) {
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
