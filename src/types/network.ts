import { dbmToSignalPercent } from './common'

export const CONNECTION_TYPES = ['wifi', 'ethernet', 'unknown'] as const

export type ConnectionType = (typeof CONNECTION_TYPES)[number]

/** Fields shared by every network snapshot. */
export interface NetworkInfoBase {
  interfaceName: string
  isConnected: boolean
  ipAddress: string | null
  gateway: string | null
  macAddress: string | null
  dns: string[]
}

export interface WifiNetworkInfo extends NetworkInfoBase {
  connectionType: 'wifi'
  isConnected: true
  ssid: string | null
  signalStrength: number | null
  signalDbm: number | null
  channel: number | null
  frequency: number | null
  security: string | null
  wifiStandard: string | null
  linkSpeedMbps: number | null
}

export interface EthernetNetworkInfo extends NetworkInfoBase {
  connectionType: 'ethernet'
  isConnected: true
  linkSpeedMbps: number | null
  duplex: string | null
  vendor: string | null
  product: string | null
}

export interface DisconnectedNetworkInfo extends NetworkInfoBase {
  connectionType: 'unknown'
  isConnected: false
}

export type ConnectedNetworkInfo = WifiNetworkInfo | EthernetNetworkInfo

export type NetworkInfo = ConnectedNetworkInfo | DisconnectedNetworkInfo

/** QR encryption tokens understood by phone Wi-Fi scanners. */
export type WifiEncryption = 'WPA' | 'WEP' | 'nopass'

/**
 * A "join this Wi-Fi" payload for the active network: what the QR encodes plus
 * the human-readable parts to render alongside it. `password` is null for open
 * networks and for secured ones whose saved secret the OS wouldn't hand over.
 */
export interface WifiShare {
  ssid: string
  encryption: WifiEncryption
  password: string | null
  /** Self-contained SVG markup of the QR code, ready to inline as a data URI. */
  qrSvg: string
}

export type ConnectionDetails = {
  ssid?: string | null
  signalStrength?: number | null
  signalDbm?: number | null
  channel?: number | null
  frequency?: number | null
  security?: string | null
  linkSpeedMbps?: number | null
  duplex?: string | null
  vendor?: string | null
  product?: string | null
}

export function createDisconnectedNetworkInfo(gateway: string | null = null): DisconnectedNetworkInfo {
  return {
    connectionType: 'unknown',
    interfaceName: 'none',
    isConnected: false,
    ipAddress: null,
    gateway,
    macAddress: null,
    dns: [],
  }
}

export function createWifiNetworkInfo(
  base: NetworkInfoBase,
  details: ConnectionDetails,
  wifiStandard: string | null,
): WifiNetworkInfo {
  const signalStrength =
    details.signalStrength ?? (details.signalDbm != null ? dbmToSignalPercent(details.signalDbm) : null)

  return {
    ...base,
    connectionType: 'wifi',
    isConnected: true,
    ssid: details.ssid ?? null,
    signalStrength,
    signalDbm: details.signalDbm ?? null,
    channel: details.channel ?? null,
    frequency: details.frequency ?? null,
    security: details.security ?? null,
    wifiStandard,
    linkSpeedMbps: details.linkSpeedMbps ?? null,
  }
}

export function createEthernetNetworkInfo(base: NetworkInfoBase, details: ConnectionDetails): EthernetNetworkInfo {
  return {
    ...base,
    connectionType: 'ethernet',
    isConnected: true,
    linkSpeedMbps: details.linkSpeedMbps ?? null,
    duplex: details.duplex ?? null,
    vendor: details.vendor ?? null,
    product: details.product ?? null,
  }
}
