import { EthernetIcon, GlobeIcon, type IconComponent, WifiIcon } from '@swiftsolve/rove-ui'
import { cva } from 'class-variance-authority'

import type { ConnectionKind } from '@/features/speed/utils/connection'

const ICONS: Record<ConnectionKind, IconComponent> = {
  wifi: WifiIcon,
  ethernet: EthernetIcon,
  unknown: GlobeIcon,
}

const iconVariants = cva(null, {
  variants: {
    kind: { wifi: 'text-series-down', ethernet: 'text-status-positive', unknown: 'text-secondary' },
  },
})

/** A speed test's medium as an icon, tinted by it: Wi-Fi, Ethernet or unknown. */
export function ConnectionIcon({ kind, size }: { kind: ConnectionKind; size: number }) {
  const Icon = ICONS[kind]
  return <Icon size={size} className={iconVariants({ kind })} />
}
