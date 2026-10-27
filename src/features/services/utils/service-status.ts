import type { ServiceReachability, ServiceStatus } from '@/types'

/** Handshake latencies up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 120
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 300

/** The health band of a service latency, shared by every place that colours one. */
export type LatencyBand = 'good' | 'warn' | 'bad'

export function latencyBand(ms: number): LatencyBand {
  if (ms <= GOOD_LATENCY_MAX_MS) return 'good'
  if (ms <= WARN_LATENCY_MAX_MS) return 'warn'
  return 'bad'
}

const LATENCY_LEVEL_CLASSES: Record<LatencyBand, string> = {
  good: 'val-good',
  warn: 'val-warn',
  bad: 'val-bad',
}

/** The `val-*` text colour for a service latency, so it reads the same everywhere. */
export function latencyLevelClass(ms: number): string {
  return LATENCY_LEVEL_CLASSES[latencyBand(ms)]
}

/**
 * Whether a probed service reads as up or down: down when the network path
 * failed (no TLS handshake, so no latency) or the host answered but is erroring
 * (5xx). Mirrors the verdict the backend timeline records (`reachability_status`
 * in store.rs) so the live list and the timeline never disagree.
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
