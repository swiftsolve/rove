import type { ConnectionType } from './network'

export type InterfaceOperState = 'up' | 'down' | 'unknown'

export type NetworkInterfaceSummary = {
  name: string
  /** The backend reports a virtual adapter (Linux, Windows) as `virtual`, not by its medium. */
  connectionType: ConnectionType | 'virtual'
  operState: InterfaceOperState
  isDefault: boolean
  isVirtual: boolean
  ipAddress: string | null
  macAddress: string | null
  speedMbps: number | null
  duplex: string | null
}
