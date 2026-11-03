import type { ServiceReachability, ServiceStatus } from '@/types'

/** Handshake latencies up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 120
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 300

/** The health band of a service latency, shared by every place that colours one. */
export type LatencyBand = 'positive' | 'warning' | 'negative'

export function latencyBand(ms: number): LatencyBand {
  if (ms <= GOOD_LATENCY_MAX_MS) return 'positive'
  if (ms <= WARN_LATENCY_MAX_MS) return 'warning'
  return 'negative'
}

/**
 * Down when the network path failed (no handshake, so no latency) or the host
 * answered with a 5xx. Mirrors the backend's `reachability_status`
 * (store/services.rs) so the live list and the timeline never disagree.
 */
export function reachabilityStatus(svc: ServiceReachability): ServiceStatus {
  if (svc.latencyMs === null) return 'down'
  if (isHttpErroring(svc.httpStatus)) return 'down'
  return 'up'
}

/** A host that answered with a 5xx: reachable, but not working. */
export function isHttpErroring(httpStatus: number | null): boolean {
  return httpStatus !== null && httpStatus >= 500
}
