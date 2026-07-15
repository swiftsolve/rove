import type { InternetStatus, ServiceReachability } from '@/types'

/**
 * A small, frontend-owned rolling buffer of per-service latency samples, powering
 * the sparkline beside each row on the Services card. It derives purely from the
 * reachability probes the Services view already polls and persists to
 * localStorage, so it needs no IPC surface — it just appends the latest latency
 * per host on each poll. (The outage *timeline* is the backend's, recorded by
 * the services heartbeat; this is only the trend line beside each row, which is
 * worth nothing once the tab is closed anyway.)
 *
 * Each poll appends one sample per host (the TLS-handshake latency, or null when
 * the probe failed) and keeps only the most recent MAX_SAMPLES per host, so the
 * store stays tiny and the sparkline shows a fixed recent window. Hosts that
 * leave the service list are dropped on the next record.
 */

/** One latency reading for a service at a point in time. */
export interface LatencySample {
  /** Epoch milliseconds when the sample was taken. */
  readonly ts: number
  /** TLS-handshake latency in ms, or null when the probe failed (service down). */
  readonly ms: number | null
}

/** Recent samples keyed by host, oldest first. */
export type LatencyHistory = Readonly<Record<string, readonly LatencySample[]>>

const STORAGE_KEY = 'rove.service-latency.v1'

// A short recent window — enough to read a trend at a glance without the store or
// the sparkline getting busy. At the ~15 s diagnostics poll this is a few minutes
// of history per service.
export const MAX_SAMPLES = 24

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
    const out: Record<string, readonly LatencySample[]> = {}
    for (const [host, samples] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(samples)) out[host] = samples.filter(isSample)
    }
    return out
  } catch {
    return {}
  }
}

export function writeLatencyHistory(history: LatencyHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Best-effort — a full or unavailable store just means no sparkline history.
  }
}

/**
 * Append the latest probe's latency for each service to `history` and return the
 * updated map. Keeps only the most recent MAX_SAMPLES per host, and drops hosts
 * that are no longer in the list so the store can't grow without bound. Pure —
 * persistence is the caller's job (see `writeLatencyHistory`).
 *
 * When this machine is offline every probe fails at once as a side effect of
 * *our* being down, not the service's — recording those nulls would draw a
 * phantom cliff on every sparkline — so the sample is skipped (history returned
 * unchanged) until the network returns. Undefined internet is treated as online,
 * matching the reachability UI.
 */
export function appendSamples(
  history: LatencyHistory,
  reachability: readonly ServiceReachability[],
  internet: InternetStatus | undefined,
): LatencyHistory {
  if (reachability.length === 0) return history

  const offline = internet === 'noInternet' || internet === 'offline'
  if (offline) return history

  const now = Date.now()
  const next: Record<string, readonly LatencySample[]> = {}
  for (const svc of reachability) {
    const prev = history[svc.host] ?? []
    const appended = [...prev, { ts: now, ms: svc.latencyMs }]
    next[svc.host] =
      appended.length > MAX_SAMPLES ? appended.slice(appended.length - MAX_SAMPLES) : appended
  }
  return next
}

export function clearLatencyHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — nothing the user can do about a failed clear.
  }
}

// A single module-level cache of the rolling history, appended to once per poll
// by `recordLatency` (called from the diagnostics effect) and read by service
// rows through `useServiceLatency`. Exposing it as an external store — subscribed
// via useSyncExternalStore — keeps the read reactive without a per-component
// effect or a setState during render.
let cache: LatencyHistory = readLatencyHistory()
const listeners = new Set<() => void>()

/**
 * Append this poll's latencies to the shared history, persist it, and notify
 * subscribers. A no-op (no write, no notification) when nothing changed — e.g.
 * while offline or with no services — so it's safe to call on every poll.
 */
export function recordLatency(
  reachability: readonly ServiceReachability[],
  internet: InternetStatus | undefined,
): void {
  const next = appendSamples(cache, reachability, internet)
  if (next === cache) return
  cache = next
  writeLatencyHistory(next)
  for (const listener of listeners) listener()
}

/**
 * Replace the history of the given hosts, keeping only the most recent
 * MAX_SAMPLES of each. This exists for the dev mock, which installs itself only
 * when the real bridge is absent: nothing in the store then came from a real
 * probe, so it hands us a full backdated window and the Services sparklines open
 * populated rather than drawing their first lone sample.
 */
export function seedLatencyHistory(seed: LatencyHistory): void {
  const next: Record<string, readonly LatencySample[]> = { ...cache }
  for (const [host, samples] of Object.entries(seed)) {
    next[host] = samples.slice(Math.max(0, samples.length - MAX_SAMPLES))
  }
  cache = next
  writeLatencyHistory(next)
  for (const listener of listeners) listener()
}

/** Subscribe to history changes; returns an unsubscribe. For useSyncExternalStore. */
export function subscribeLatency(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current history — a stable reference between changes, as useSyncExternalStore requires. */
export function getLatencySnapshot(): LatencyHistory {
  return cache
}
