import type { ConnectedNetworkInfo, EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from './network'

export function isWifiNetwork(info: NetworkInfo): info is WifiNetworkInfo {
  return info.connectionType === 'wifi'
}

export function isEthernetNetwork(info: NetworkInfo): info is EthernetNetworkInfo {
  return info.connectionType === 'ethernet'
}

export function isConnectedNetwork(info: NetworkInfo): info is ConnectedNetworkInfo {
  return info.isConnected
}

export function getLinkCapacityMbps(info: NetworkInfo): number | null {
  if (isWifiNetwork(info) || isEthernetNetwork(info)) {
    return info.linkSpeedMbps
  }
  return null
}
