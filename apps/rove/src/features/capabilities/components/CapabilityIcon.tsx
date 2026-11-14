import {
  BrowsingIcon,
  CloudGamingIcon,
  DownloadIcon,
  GamepadIcon,
  HdStreamIcon,
  type IconComponent,
  LiveStreamIcon,
  UltraHdStreamIcon,
  VideoCallIcon,
} from '@swiftsolve/rove-ui'

import type { CapabilityId } from '@/types'

type CapabilityIconProps = {
  id: CapabilityId
  size?: number
  className?: string
}

const ICONS: Record<CapabilityId, IconComponent> = {
  browsing: BrowsingIcon,
  'streaming-hd': HdStreamIcon,
  'streaming-4k': UltraHdStreamIcon,
  'video-calls': VideoCallIcon,
  gaming: GamepadIcon,
  'cloud-gaming': CloudGamingIcon,
  'large-downloads': DownloadIcon,
  'live-streaming': LiveStreamIcon,
}

/** The icon that stands for a capability: a gamepad for gaming, and so on. */
export function CapabilityIcon({ id, size = 22, className }: CapabilityIconProps) {
  const Icon = ICONS[id]
  return <Icon size={size} className={className} />
}
