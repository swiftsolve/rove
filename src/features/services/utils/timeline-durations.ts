import type { ServiceEvent, ServiceTransitionEvent } from '@/types'

/**
 * The precomputed durations the timeline rows read. The live one, an ongoing
 * outage's, is the clock less its start, read by that row alone.
 */
export type EventDurations = {
  /** Closed outages, keyed by `outageKey` of the recovery. */
  outageByKey: Map<string, number>
  /** Offline spells, keyed by the "connection restored" event's ts. */
  offlineByTs: Map<number, number>
  /** When each still-down host dropped. */
  ongoingDownStartByHost: Map<string, number>
}

function outageKey(host: string, ts: number): string {
  return `${host}:${ts}`
}

/**
 * Pair each recovery with the outage it ended, keyed by `outageKey`, so a
 * "came back up" row can show how long the service was down.
 */
export function outageDurations(newestFirst: ServiceEvent[]): Map<string, number> {
  const durations = new Map<string, number>()
  const downAt = new Map<string, number>()
  for (const e of [...newestFirst].reverse()) {
    if (e.type !== 'transition') continue
    if (e.status === 'down') {
      downAt.set(e.host, e.ts)
    } else {
      const start = downAt.get(e.host)
      if (start != null) {
        durations.set(outageKey(e.host, e.ts), e.ts - start)
        downAt.delete(e.host)
      }
    }
  }
  return durations
}

/**
 * When each still-down host dropped, for the live "Down for …" on its latest
 * drop. The log is newest-first, so a host's first transition is its latest.
 */
export function ongoingDownStarts(newestFirst: ServiceEvent[]): Map<string, number> {
  const starts = new Map<string, number>()
  const seen = new Set<string>()
  for (const e of newestFirst) {
    if (e.type !== 'transition' || seen.has(e.host)) continue
    seen.add(e.host)
    if (e.status === 'down') starts.set(e.host, e.ts)
  }
  return starts
}

/**
 * Pair each "connection restored" with the "lost" it ended, keyed by the
 * restored event's ts, so the recovery row can show how long we were offline.
 */
export function offlineDurations(newestFirst: ServiceEvent[]): Map<number, number> {
  const durations = new Map<number, number>()
  let lostAt: number | null = null
  for (const e of [...newestFirst].reverse()) {
    if (e.type !== 'connection') continue
    if (e.status === 'lost') {
      lostAt = e.ts
    } else if (lostAt != null) {
      durations.set(e.ts, e.ts - lostAt)
      lostAt = null
    }
  }
  return durations
}

export function eventKey(event: ServiceEvent): string {
  if (event.type === 'running') return `running:${event.ts}`
  if (event.type === 'connection') return `connection:${event.status}:${event.ts}`
  return `${event.host}:${event.ts}:${event.status}`
}

/**
 * The "Down for …" a recovery shows: the outage it closed. Drops get none; the
 * live one on an ongoing outage is its own row's (see `isOngoingDrop`).
 */
export function closedOutageMs(event: ServiceTransitionEvent, durations: EventDurations): number | undefined {
  if (event.status === 'up') return durations.outageByKey.get(outageKey(event.host, event.ts))
  return undefined
}

/** Whether this is the latest drop of a service that's still down, whose row counts the outage up live. */
export function isOngoingDrop(event: ServiceTransitionEvent, durations: EventDurations): boolean {
  return event.status === 'down' && durations.ongoingDownStartByHost.get(event.host) === event.ts
}
