import type { PingStats } from './speed'

export interface NetworkDiagnostics {
  readonly gateway: string | null
  readonly defaultInterface: string | null
  readonly dnsServers: readonly string[]
  readonly gatewayPing: PingStats | null
  /** Router make from the gateway's MAC OUI, or null when unknown. */
  readonly gatewayVendor: string | null
  /** Router model from the gateway's SNMP sysDescr, or null when unavailable. */
  readonly gatewayModel: string | null
}
