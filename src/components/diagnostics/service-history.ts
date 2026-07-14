import type { InternetStatus, ServiceReachability } from '@/types'

/**
 * A lightweight, frontend-owned log of service events, powering the Services
 * timeline. Unlike speed history (which lives in the backend database), this is
 * derived purely from the reachability probes the Connection view already polls,
 * so it needs no new IPC surface — it just diffs each probe against the last
 * known status and appends what changed to localStorage.
 *
 * Three kinds of event are recorded:
 *  - `transition`: a single service went down or came back up.
 *  - `running`: a positive summary of how many services are up — logged once as
 *    a baseline the first time monitoring sees the services, and again whenever
 *    everything recovers to healthy after an outage.
 *  - `connection`: this machine's own network dropped or returned. When it
 *    drops, every probe fails at once — not an outage of theirs — so the log
 *    records a single "connection lost" instead of a wall of per-service downs.
 *
 * Only these moments are stored (not a sample every 15 s), so the log stays
 * small and reads as a timeline of outages and recoveries.
 */

/** The status a service was in at a point in time. */
export type ServiceStatus = 'up' | 'down'

/** One service crossing between up and down. */
export interface ServiceTransitionEvent {
  readonly type: 'transition'
  /** Hostname probed, e.g. "netflix.com" — the stable key across renames. */
  readonly host: string
  /** Service label as it read when the transition was recorded. */
  readonly name: string
  /** The status the service transitioned *into*. */
  readonly status: ServiceStatus
  /** Epoch milliseconds when the transition was first observed. */
  readonly ts: number
}

/** A positive summary: `count` services were up at this moment (baseline or full
 *  recovery). */
export interface ServicesRunningEvent {
  readonly type: 'running'
  readonly count: number
  readonly ts: number
}

/** This machine's own network connection dropping or returning. A drop is
 *  recorded once, in place of the per-service downs its probes would otherwise
 *  produce; `restored` closes it when the machine is back online. */
export interface ConnectionEvent {
  readonly type: 'connection'
  readonly status: 'lost' | 'restored'
  readonly ts: number
}

export type ServiceEvent = ServiceTransitionEvent | ServicesRunningEvent | ConnectionEvent

const STORAGE_KEY = 'rove.service-history.v2'

// Keep the log bounded on both axes: a 30-day window (outages are worth a longer
// memory than the device feed's 7 days) and a hard cap so a flapping service
// can't grow it without bound. Pruning keeps the newest entries.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const MAX_EVENTS = 500

// A service reads as "down" when the network path failed (no TLS handshake, so
// null latency) or the host answered but is erroring (5xx). This mirrors the
// verdict the Services card and manage page render, so the timeline agrees with
// the live number the user sees.
export function reachabilityStatus(svc: ServiceReachability): ServiceStatus {
  if (svc.latencyMs === null) return 'down'
  if (svc.httpStatus !== null && svc.httpStatus >= 500) return 'down'
  return 'up'
}

function readLog(): readonly ServiceEvent[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEvent)
  } catch {
    return []
  }
}

function isEvent(value: unknown): value is ServiceEvent {
  if (typeof value !== 'object' || value == null) return false
  const e = value as Record<string, unknown>
  if (typeof e.ts !== 'number') return false
  if (e.type === 'running') return typeof e.count === 'number'
  if (e.type === 'connection') return e.status === 'lost' || e.status === 'restored'
  return (
    e.type === 'transition' &&
    typeof e.host === 'string' &&
    typeof e.name === 'string' &&
    (e.status === 'up' || e.status === 'down')
  )
}

// Trim to the retention window and cap, keeping the most recent events. Input is
// assumed chronological (oldest first), matching how the log is appended.
function prune(events: readonly ServiceEvent[]): readonly ServiceEvent[] {
  const cutoff = Date.now() - WINDOW_MS
  const within = events.filter((e) => e.ts >= cutoff)
  return within.length > MAX_EVENTS ? within.slice(within.length - MAX_EVENTS) : within
}

function writeLog(events: readonly ServiceEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // Best-effort — a full or unavailable store just means no history is kept.
  }
}

// The last known status per host, taken from its most recent transition. A host
// with no transitions is absent from the map ("never seen"), which the diff
// treats as "not currently down" so a service that's been fine since first sight
// records nothing.
function lastStatusByHost(events: readonly ServiceEvent[]): Map<string, ServiceStatus> {
  const map = new Map<string, ServiceStatus>()
  for (const e of events) if (e.type === 'transition') map.set(e.host, e.status)
  return map
}

// Whether the machine is currently in a recorded network-lost state: true when
// the most recent `connection` event is a `lost` with no `restored` closing it.
// No connection events → assumed online.
function isConnectionLost(events: readonly ServiceEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!
    if (e.type === 'connection') return e.status === 'lost'
  }
  return false
}

/**
 * Diff the latest probes against the log and append any changes. Records a
 * `down` when a service that wasn't already down fails (including the first time
 * a service is seen already down), an `up` when a service recovers, a `running`
 * baseline the first time services are ever seen, and a `running` summary
 * whenever the last outage clears. Re-running with unchanged probes appends
 * nothing, so it's safe to call on every poll.
 *
 * `internet` is this machine's own reachability. When it isn't reachable, every
 * service probe fails at once as a side effect of *our* being offline — so
 * instead of logging a wall of per-service downs, a single `connection: 'lost'`
 * is recorded and per-service diffing is frozen until the network returns (which
 * appends a `connection: 'restored'`). Undefined is treated as online, matching
 * the reachability UI — there's nothing to judge before the first probe lands.
 */
export function recordReachability(
  reachability: readonly ServiceReachability[],
  internet: InternetStatus | undefined,
): void {
  if (reachability.length === 0) return
  const log = readLog()
  const now = Date.now()
  const offline = internet === 'noInternet' || internet === 'offline'
  const wasOffline = isConnectionLost(log)

  // The machine itself is offline: freeze per-service state and record a single
  // "connection lost" the first time we cross into offline. The frozen status
  // means the eventual recovery diffs against the real pre-outage state rather
  // than a phantom mass-down. Re-running while still offline appends nothing.
  if (offline) {
    if (!wasOffline) {
      writeLog(prune([...log, { type: 'connection', status: 'lost', ts: now }]))
    }
    return
  }

  const lastStatus = lastStatusByHost(log)
  const additions: ServiceEvent[] = []

  // Back online after a recorded drop: close the outage with a single
  // "connection restored" before resuming normal per-service diffing below.
  if (wasOffline) {
    additions.push({ type: 'connection', status: 'restored', ts: now })
  }

  const upCount = reachability.filter((s) => reachabilityStatus(s) === 'up').length

  // Baseline: the first time we ever observe the services, anchor the timeline
  // with a positive "N services running" summary.
  if (log.length === 0 && upCount > 0) {
    additions.push({ type: 'running', count: upCount, ts: now })
  }

  const prevAnyDown = [...lastStatus.values()].some((s) => s === 'down')
  let nowAnyDown = false
  let recovered = false

  for (const svc of reachability) {
    const status = reachabilityStatus(svc)
    if (status === 'down') nowAnyDown = true
    const prev = lastStatus.get(svc.host)
    const changed = status === 'down' ? prev !== 'down' : prev === 'down'
    if (changed) {
      additions.push({ type: 'transition', host: svc.host, name: svc.name, status, ts: now })
      if (status === 'up') recovered = true
    }
  }

  // Full recovery: something had been down and now everything is healthy again.
  if (recovered && prevAnyDown && !nowAnyDown) {
    additions.push({ type: 'running', count: upCount, ts: now })
  }

  if (additions.length === 0) return
  writeLog(prune([...log, ...additions]))
}

/** The recorded events, newest first. */
export function getServiceHistory(): readonly ServiceEvent[] {
  return [...readLog()].reverse()
}

export function clearServiceHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — nothing the user can do about a failed clear.
  }
}
