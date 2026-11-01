import type { NetworkInfo } from '@/types'
import { isEthernetNetwork, isWifiNetwork } from '@/types'

export type ConnectionDisplayVariant = 'wifi' | 'ethernet' | 'disconnected'

export interface ConnectionDisplay {
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
