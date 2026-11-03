import type { PingStats } from './speed'

/**
 * Whether this machine can reach the public internet — the context a service
 * verdict needs to mean anything.
 * - `online`     an internet anchor answered; service verdicts are trustworthy.
 * - `noInternet` on a LAN (a gateway exists) but no anchor answered; the WAN is
 *                down, so public services can't be checked (LAN ones may still be).
 * - `offline`    no default gateway at all; not on a usable network.
 */
export type InternetStatus = 'online' | 'noInternet' | 'offline'

/** Whether the public internet is unreachable. Unknown (`undefined`) counts as
 *  up, so nothing reads as down before the first check lands. */
export function isInternetDown(status: InternetStatus | undefined): boolean {
  return status === 'noInternet' || status === 'offline'
}

export type NetworkDiagnostics = {
  gateway: string | null
  defaultInterface: string | null
  dnsServers: string[]
  gatewayPing: PingStats | null
  /** Public-internet reachability, so Services can tell an outage apart from
   *  this machine being offline. */
  internet: InternetStatus
  /** Router make from the gateway's MAC OUI, or null when unknown. */
  gatewayVendor: string | null
  /** Router model from the gateway's SNMP sysDescr (or UPnP modelName), or null
   *  when unavailable. */
  gatewayModel: string | null
  /** Router product name from the gateway's UPnP friendlyName (e.g. "Giga Hub
   *  2.0"), or null when it doesn't announce over SSDP. */
  gatewayName: string | null
  /** WAN-side identity (ISP, ASN, location, public IP), or null when the lookup
   *  service is unreachable — e.g. no internet or the request timed out. */
  isp: IspInfo | null
}

/**
 * The fast-changing diagnostics, polled tightly without re-running the ISP and
 * router lookups. Merged over the last full NetworkDiagnostics.
 */
export type LiveDiagnostics = {
  gatewayPing: PingStats | null
  /** Public-internet reachability, refreshed each poll. */
  internet: InternetStatus
}

/**
 * Service reachability plus the internet verdict from the same batch, so the
 * Services view can show one "connection lost" instead of every service down
 * when this machine is offline.
 */
export type ServicesReport = {
  /** Public-internet reachability, from the same batch as `services`. */
  internet: InternetStatus
  /** TCP-connect reachability of the user's service list. */
  services: ServiceReachability[]
}

/** WAN-side identity from an IP-geolocation lookup; every field is optional. */
export type IspInfo = {
  /** ISP or organization name, e.g. "Comcast Cable". */
  name: string | null
  /** Autonomous-system number, formatted "AS15169". */
  asn: string | null
  /** The ISP's registered domain, e.g. "bell.ca", or null when the lookup didn't
   *  report one. Resolved to a brand icon on the card. */
  domain: string | null
  city: string | null
  region: string | null
  country: string | null
  /** Public (WAN) IP reported by the same lookup. */
  publicIp: string | null
  /** True when the public IP's ASN is a datacenter/hosting network, i.e. we're
   *  behind a VPN or proxy and the fields above describe the exit node rather
   *  than the real ISP. The card badges itself and adds a hint when set. */
  isVpn: boolean
}

/** A service in the user's reachability list — the durable definition, without
 *  a measurement. Ships with defaults but is editable per user (add/remove). */
export type ServiceDefinition = {
  /** Human label, e.g. "Netflix". */
  name: string
  /** Host probed, a hostname ("netflix.com") or IP ("192.168.1.1"). */
  host: string
}

/** Reachability of one internet service on two independent axes: network
 *  latency (TLS handshake to :443) and application health (an HTTP HEAD). They
 *  can disagree — a service can be reachable in a few ms yet answering 5xx. */
export type ServiceReachability = {
  /** Human label, e.g. "Netflix". */
  name: string
  /** Hostname probed, e.g. "netflix.com". */
  host: string
  /** TLS-handshake latency in ms, or null when it failed/timed out. */
  latencyMs: number | null
  /** HTTP status from a HEAD to the host, or null for IP-literal hosts and when
   *  no HTTP response came back. A 5xx means the path is up but the service is
   *  erroring (e.g. a Cloudflare 1033 tunnel error surfaces as 530). */
  httpStatus: number | null
}

/** The status a service was in at a point in time. */
export type ServiceStatus = 'up' | 'down'

/** One service crossing between up and down. */
export type ServiceTransitionEvent = {
  type: 'transition'
  /** Hostname probed — the stable key across renames. */
  host: string
  /** The service's label as it read when the crossing was recorded. */
  name: string
  /** The status it moved *into*. */
  status: ServiceStatus
  /** Epoch milliseconds when the crossing was first observed. */
  ts: number
}

/** A summary of the tracked services: `count` of `total` were up (a baseline, or
 *  a full recovery after an outage). A recovery always has `count === total`; a
 *  baseline can be partial, when a service was already down the first time
 *  monitoring looked. */
export type ServicesRunningEvent = {
  type: 'running'
  count: number
  total: number
  ts: number
}

/** This machine's own network dropping or returning. Recorded once in place of
 *  the per-service downs its probes would otherwise produce. */
export type ConnectionEvent = {
  type: 'connection'
  status: 'lost' | 'restored'
  ts: number
}

/**
 * One entry in the services timeline, as the backend records it (see
 * `service_events`). Only moments are stored — never a sample per probe — so the
 * log reads as a history of outages and recoveries.
 */
export type ServiceEvent = ServiceTransitionEvent | ServicesRunningEvent | ConnectionEvent
