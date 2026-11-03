import { type InternetStatus, isInternetDown, type ServiceReachability } from '@/types'

/**
 * A frontend-owned rolling buffer of per-host latency for the Services row
 * sparklines, built from the probes the view already polls and kept in
 * localStorage, so it needs no IPC. The outage timeline is the backend's; this
 * is only the recent trend, so it doesn't warrant a backend store.
 */

/** One latency reading for a service at a point in time. */
export type LatencySample = {
  /** Epoch milliseconds when the sample was taken. */
  ts: number
  /** TLS-handshake latency in ms, or null when the probe failed (service down). */
  ms: number | null
}

/** Recent samples keyed by host, oldest first. */
export type LatencyHistory = Record<string, LatencySample[]>

const STORAGE_KEY = 'rove.service-latency.v1'

// About six minutes at the 15 s services poll: enough to read a trend at a glance.
export const MAX_SAMPLES = 24

function latestWindow(samples: LatencySample[]): LatencySample[] {
  return samples.slice(Math.max(0, samples.length - MAX_SAMPLES))
}

function isSample(value: unknown): value is LatencySample {
  if (typeof value !== 'object' || value == null) return false
  const s = value as Record<string, unknown>
  return typeof s.ts === 'number' && (s.ms === null || typeof s.ms === 'number')
}

export function readLatencyHistory(): LatencyHistory {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return {}
  }
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) return {}
    const out: Record<string, LatencySample[]> = {}
    for (const [host, samples] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(samples)) out[host] = samples.filter(isSample)
    }
    return out
  } catch {
    return {}
  }
}

function writeLatencyHistory(history: LatencyHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Best-effort: a full or unavailable store just means no sparkline history.
  }
}

/**
 * Append each service's latest latency, keeping MAX_SAMPLES per host and dropping
 * hosts no longer listed so the store can't grow without bound. Pure: the caller
 * persists.
 *
 * Offline, every probe fails because we're down, not the service, so the batch is
 * skipped (the same `history` is returned) rather than drawing a phantom cliff on
 * every sparkline. Undefined internet counts as online, as in the Services view.
 */
export function appendSamples(
  history: LatencyHistory,
  reachability: ServiceReachability[],
  internet: InternetStatus | undefined,
): LatencyHistory {
  if (reachability.length === 0) return history

  if (isInternetDown(internet)) return history

  const now = Date.now()
  const next: Record<string, LatencySample[]> = {}
  for (const svc of reachability) {
    const previous = history[svc.host] ?? []
    next[svc.host] = latestWindow([...previous, { ts: now, ms: svc.latencyMs }])
  }
  return next
}

// An external store (read with useSyncExternalStore), so rows stay reactive
// without a per-component effect or a setState during render.
let cache: LatencyHistory = readLatencyHistory()
const listeners = new Set<() => void>()

function replaceCache(next: LatencyHistory): void {
  cache = next
  writeLatencyHistory(next)
  for (const listener of listeners) listener()
}

/**
 * Append this poll's latencies to the shared history, persist it, and notify
 * subscribers. A no-op while offline or with no services, so it's safe to call on
 * every poll.
 */
export function recordLatency(reachability: ServiceReachability[], internet: InternetStatus | undefined): void {
  const next = appendSamples(cache, reachability, internet)
  if (next === cache) return
  replaceCache(next)
}

/**
 * Replace the history of the given hosts, keeping MAX_SAMPLES of each. For the
 * dev mock, so its sparklines open populated rather than with one lone sample.
 */
export function seedLatencyHistory(seed: LatencyHistory): void {
  const next: Record<string, LatencySample[]> = { ...cache }
  for (const [host, samples] of Object.entries(seed)) {
    next[host] = latestWindow(samples)
  }
  replaceCache(next)
}

/** Subscribe to history changes; returns an unsubscribe. For useSyncExternalStore. */
export function subscribeLatency(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current history: a stable reference between changes, as useSyncExternalStore requires. */
export function getLatencySnapshot(): LatencyHistory {
  return cache
}
