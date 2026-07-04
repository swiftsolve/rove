import type { PingStats } from './speed'

export interface NetworkDiagnostics {
  readonly gateway: string | null
  readonly defaultInterface: string | null
  readonly dnsServers: readonly string[]
  readonly gatewayPing: PingStats | null
}
