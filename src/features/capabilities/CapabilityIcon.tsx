import type { CapabilityId } from '@/types'
import {
  BrowsingIcon,
  CloudGamingIcon,
  DownloadIcon,
  GamepadIcon,
  GlobeStreamIcon,
  HdStreamIcon,
  LiveStreamIcon,
  UltraHdStreamIcon,
  VideoCallIcon,
} from '@/components/icons/Icons'

interface CapabilityIconProps {
  id: CapabilityId
  size?: number
  className?: string
}

const ICONS: Record<CapabilityId, typeof BrowsingIcon> = {
  browsing: BrowsingIcon,
  'streaming-hd': HdStreamIcon,
  'streaming-4k': UltraHdStreamIcon,
  'video-calls': VideoCallIcon,
  gaming: GamepadIcon,
  'cloud-gaming': CloudGamingIcon,
  'large-downloads': DownloadIcon,
  'live-streaming': LiveStreamIcon,
}

export function CapabilityIcon({
  id,
  size = 22,
  className,
}: CapabilityIconProps): JSX.Element {
  const Icon = ICONS[id] ?? GlobeStreamIcon
  return <Icon size={size} className={className} />
}
