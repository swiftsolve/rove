import {
  Card,
  CardBody,
  DataList,
  DataRow,
  EthernetIcon,
  IconTile,
  type IconTileColor,
  LayersIcon,
  NoValue,
  StatusDot,
  Tooltip,
  WifiIcon,
} from '@swiftsolve/rove-ui'
import { cva, cx } from 'class-variance-authority'

import type { NetworkInterfaceSummary } from '@/types'
import { formatConnectionType, formatDisplayValue, formatMac, formatOperState, formatSpeedMbps } from '@/utils/format'

// Wi-Fi and Ethernet take the accent, as on the connection strip; anything
// else stays neutral. Every type needs an entry: a missing one leaves the tile
// washed in the text colour.
const TILE_COLORS = {
  wifi: 'var(--accent-default)',
  ethernet: 'var(--accent-default)',
  virtual: 'neutral',
  unknown: 'neutral',
} as const satisfies Record<NetworkInterfaceSummary['connectionType'], IconTileColor>

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
  const linkSpeed = iface.speedMbps != null ? formatSpeedMbps(iface.speedMbps) : null
  return (
    <Card as="li">
      <div className={PANEL_HEADER}>
        <div className="panel-head-main">
          <IconTile color={TILE_COLORS[iface.connectionType]} icon={<InterfaceIcon iface={iface} />} />
          <h2 className="type-heading min-w-0 truncate leading-title text-primary">{iface.name}</h2>
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
          <DataRow label="Link speed">{linkSpeed ?? <NoValue />}</DataRow>
          <DataRow label="IP address">{formatDisplayValue(iface.ipAddress) ?? <NoValue />}</DataRow>
          <DataRow label="MAC">{formatMac(iface.macAddress) ?? <NoValue />}</DataRow>
        </DataList>
      </CardBody>
    </Card>
  )
}
