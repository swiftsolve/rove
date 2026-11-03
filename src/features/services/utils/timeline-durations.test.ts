import { describe, expect, it } from 'vitest'

import type { ServiceEvent, ServiceTransitionEvent } from '@/types'

import {
  type EventDurations,
  offlineDurations,
  ongoingDownStarts,
  outageDurations,
  transitionDurationMs,
} from './timeline-durations'

function transition(host: string, status: 'up' | 'down', ts: number): ServiceTransitionEvent {
  return { type: 'transition', host, name: host, status, ts }
}

// Newest first, as the backend returns the log.
const LOG: ServiceEvent[] = [
  transition('a.com', 'down', 900),
  { type: 'connection', status: 'restored', ts: 800 },
  transition('b.com', 'up', 700),
  { type: 'connection', status: 'lost', ts: 650 },
  transition('a.com', 'up', 500),
  transition('b.com', 'down', 400),
  transition('a.com', 'down', 200),
]

describe('timeline durations', () => {
  it('pairs each recovery with the outage it ended', () => {
    const outages = outageDurations(LOG)
    expect(outages.get('a.com:500')).toBe(300)
    expect(outages.get('b.com:700')).toBe(300)
    expect(outages.size).toBe(2)
  })

  it('pairs each restored connection with the loss it ended', () => {
    expect(offlineDurations(LOG)).toEqual(new Map([[800, 150]]))
  })

  it('finds when each still-down host dropped, from its latest transition', () => {
    expect(ongoingDownStarts(LOG)).toEqual(new Map([['a.com', 900]]))
  })

  it('times a recovery by its outage, the latest drop live, and older drops not at all', () => {
    const durations: EventDurations = {
      outageByKey: outageDurations(LOG),
      offlineByTs: offlineDurations(LOG),
      ongoingDownStartByHost: ongoingDownStarts(LOG),
      now: 1000,
    }
    expect(transitionDurationMs(transition('a.com', 'up', 500), durations)).toBe(300)
    expect(transitionDurationMs(transition('a.com', 'down', 900), durations)).toBe(100)
    expect(transitionDurationMs(transition('a.com', 'down', 200), durations)).toBeUndefined()
  })
})
