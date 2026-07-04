import type { ConnectionType } from './network'

export const INTERFACE_OPER_STATES = ['up', 'down', 'unknown'] as const

export type InterfaceOperState = (typeof INTERFACE_OPER_STATES)[number]

export interface NetworkInterfaceSummary {
  readonly name: string
  readonly connectionType: ConnectionType
  readonly operState: InterfaceOperState
  readonly isDefault: boolean
  readonly isVirtual: boolean
  readonly ipAddress: string | null
  readonly macAddress: string | null
  readonly speedMbps: number | null
  readonly duplex: string | null
}
