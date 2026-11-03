import type { ConnectionType } from './network'

export type InterfaceOperState = 'up' | 'down' | 'unknown'

export type NetworkInterfaceSummary = {
  name: string
  connectionType: ConnectionType
  operState: InterfaceOperState
  isDefault: boolean
  isVirtual: boolean
  ipAddress: string | null
  macAddress: string | null
  speedMbps: number | null
  duplex: string | null
}
