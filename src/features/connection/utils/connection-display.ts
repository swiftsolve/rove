import type { NetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'
import { formatSpeedMbps } from '@/lib/format'

export type ConnectionDisplayVariant = 'wifi' | 'ethernet' | 'disconnected'

export type ConnectionDisplay = {
  variant: ConnectionDisplayVariant
  title: string
  subtitle: string
}

export function getConnectionDisplay(info: NetworkInfo): ConnectionDisplay {
  if (isWifiNetwork(info)) {
    return {
      variant: 'wifi',
      title: info.ssid ?? 'WiFi Network',
      subtitle: info.interfaceName,
    }
  }

  if (isEthernetNetwork(info)) {
    return {
      variant: 'ethernet',
      title: info.product ?? info.vendor ?? 'Wired connection',
      subtitle: info.interfaceName,
    }
  }

  return {
    variant: 'disconnected',
    title: 'Not connected',
    subtitle: 'No active network connection',
  }
}

/** The link's negotiated speed, e.g. "866 Mbps"; null when offline or unreported. */
export function formatLinkSpeed(info: NetworkInfo): string | null {
  if (!isWifiNetwork(info) && !isEthernetNetwork(info)) return null
  return info.linkSpeedMbps != null ? formatSpeedMbps(info.linkSpeedMbps) : null
}
