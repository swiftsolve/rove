import type { ConnectionType } from './network'

export const INTERFACE_OPER_STATES = ['up', 'down', 'unknown'] as const

export type InterfaceOperState = (typeof INTERFACE_OPER_STATES)[number]

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
