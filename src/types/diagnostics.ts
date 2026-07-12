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
  /** WAN-side identity (ISP, ASN, location, public IP), or null when the lookup
   *  service is unreachable — e.g. no internet or the request timed out. */
  readonly isp: IspInfo | null
  /** TCP-connect reachability of well-known internet services. */
  readonly services: readonly ServiceReachability[]
}

/**
 * The fast-changing subset of diagnostics, refreshed on a tight poll so the
 * live numbers stay current without re-running the heavier ISP + router-identity
 * lookups. Merged over the last full NetworkDiagnostics in the view.
 */
export interface LiveDiagnostics {
  readonly gatewayPing: PingStats | null
  readonly services: readonly ServiceReachability[]
}

/** WAN-side identity from an IP-geolocation lookup; every field is optional. */
export interface IspInfo {
  /** ISP or organization name, e.g. "Comcast Cable". */
  readonly name: string | null
  /** Autonomous-system number, formatted "AS15169". */
  readonly asn: string | null
  readonly city: string | null
  readonly region: string | null
  readonly country: string | null
  /** Public (WAN) IP reported by the same lookup. */
  readonly publicIp: string | null
}

/** A service in the user's reachability list — the durable definition, without
 *  a measurement. Ships with defaults but is editable per user (add/remove). */
export interface ServiceDefinition {
  /** Human label, e.g. "Netflix". */
  readonly name: string
  /** Host probed, a hostname ("netflix.com") or IP ("192.168.1.1"). */
  readonly host: string
}

/** Reachability of one internet service on two independent axes: network
 *  latency (TLS handshake to :443) and application health (an HTTP HEAD). They
 *  can disagree — a service can be reachable in a few ms yet answering 5xx. */
export interface ServiceReachability {
  /** Human label, e.g. "Netflix". */
  readonly name: string
  /** Hostname probed, e.g. "netflix.com". */
  readonly host: string
  /** TLS-handshake latency in ms, or null when it failed/timed out. */
  readonly latencyMs: number | null
  /** HTTP status from a HEAD to the host, or null for IP-literal hosts and when
   *  no HTTP response came back. A 5xx means the path is up but the service is
   *  erroring (e.g. a Cloudflare 1033 tunnel error surfaces as 530). */
  readonly httpStatus: number | null
}
