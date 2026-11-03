export const CONNECTION_TYPES = ['wifi', 'ethernet', 'unknown'] as const

export type ConnectionType = (typeof CONNECTION_TYPES)[number]

/** Fields shared by every network snapshot. */
export type NetworkInfoBase = {
  interfaceName: string
  isConnected: boolean
  ipAddress: string | null
  gateway: string | null
  macAddress: string | null
  dns: string[]
}

export type WifiNetworkInfo = {
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
} & NetworkInfoBase

export type EthernetNetworkInfo = {
  connectionType: 'ethernet'
  isConnected: true
  linkSpeedMbps: number | null
  duplex: string | null
  vendor: string | null
  product: string | null
} & NetworkInfoBase

export type DisconnectedNetworkInfo = {
  connectionType: 'unknown'
  isConnected: false
} & NetworkInfoBase

export type ConnectedNetworkInfo = WifiNetworkInfo | EthernetNetworkInfo

export type NetworkInfo = ConnectedNetworkInfo | DisconnectedNetworkInfo

/** QR encryption tokens understood by phone Wi-Fi scanners. */
export type WifiEncryption = 'WPA' | 'WEP' | 'nopass'

/**
 * A "join this Wi-Fi" payload for the active network: what the QR encodes plus
 * the human-readable parts to render alongside it. `password` is null for open
 * networks and for secured ones whose saved secret the OS wouldn't hand over.
 */
export type WifiShare = {
  ssid: string
  encryption: WifiEncryption
  password: string | null
  /** Self-contained SVG markup of the QR code, ready to inline as a data URI. */
  qrSvg: string
}
