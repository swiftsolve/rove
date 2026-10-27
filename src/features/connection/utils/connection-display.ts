import type { NetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'

export type ConnectionDisplayVariant = 'wifi' | 'ethernet' | 'disconnected'

export interface ConnectionDisplay {
  variant: ConnectionDisplayVariant
  badge: string
  title: string
  subtitle: string
  isConnected: boolean
}

export function getConnectionDisplay(info: NetworkInfo): ConnectionDisplay {
  if (isWifiNetwork(info)) {
    return {
      variant: 'wifi',
      badge: 'WiFi',
      title: info.ssid ?? 'WiFi Network',
      subtitle: info.interfaceName,
      isConnected: true,
    }
  }

  if (isEthernetNetwork(info)) {
    return {
      variant: 'ethernet',
      badge: 'Ethernet',
      title: info.product ?? info.vendor ?? 'Wired connection',
      subtitle: info.interfaceName,
      isConnected: true,
    }
  }

  return {
    variant: 'disconnected',
    badge: 'Offline',
    title: 'Not connected',
    subtitle: 'No active network connection',
    isConnected: false,
  }
}
