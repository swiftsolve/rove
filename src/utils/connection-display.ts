import type { NetworkInfo } from '@shared/types'
import { isDisconnectedNetwork, isEthernetNetwork, isWifiNetwork } from '@shared/types'

export type ConnectionDisplayVariant = 'wifi' | 'ethernet' | 'disconnected'

export interface ConnectionDisplay {
  readonly variant: ConnectionDisplayVariant
  readonly badge: string
  readonly title: string
  readonly subtitle: string
  readonly isConnected: boolean
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

  if (isDisconnectedNetwork(info)) {
    return {
      variant: 'disconnected',
      badge: 'Offline',
      title: 'Not connected',
      subtitle: 'No active network connection',
      isConnected: false,
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
