import type { ServiceReachability, ServiceStatus } from '@/types'

/**
 * Whether a probed service reads as up or down: down when the network path
 * failed (no TLS handshake, so no latency) or the host answered but is erroring
 * (5xx). Mirrors the verdict the backend timeline records (`reachability_status`
 * in store.rs) so the live list and the timeline never disagree.
 */
export function reachabilityStatus(svc: ServiceReachability): ServiceStatus {
  if (svc.latencyMs === null) return 'down'
  if (svc.httpStatus !== null && svc.httpStatus >= 500) return 'down'
  return 'up'
}
