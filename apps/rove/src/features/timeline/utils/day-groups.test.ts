import { describe, expect, it } from 'vitest'

import { formatDayHeading, groupByDay } from '@/features/timeline/utils/day-groups'

// Local-time dates, so the tests hold in any time zone.
const now = new Date(2026, 9, 28, 15, 0).getTime()

function event(id: number, ts: number): { id: number; ts: number } {
  return { id, ts }
}

describe('formatDayHeading', () => {
  it('says Today and Yesterday for the two latest days', () => {
    expect(formatDayHeading(new Date(2026, 9, 28, 0, 5).getTime(), now)).toBe('Today')
    expect(formatDayHeading(new Date(2026, 9, 27, 23, 59).getTime(), now)).toBe('Yesterday')
  })

  it('adds the year only for another year', () => {
    expect(formatDayHeading(new Date(2026, 9, 20).getTime(), now)).not.toMatch(/2026/)
    expect(formatDayHeading(new Date(2025, 11, 31).getTime(), now)).toMatch(/2025/)
  })
})

describe('groupByDay', () => {
  it('slices the feed into same-day runs in the order given', () => {
    const events = [
      event(4, new Date(2026, 9, 28, 14).getTime()),
      event(3, new Date(2026, 9, 28, 9).getTime()),
      event(2, new Date(2026, 9, 27, 20).getTime()),
      event(1, new Date(2026, 9, 25, 8).getTime()),
    ]
    const groups = groupByDay(events, now)
    expect(groups.slice(0, 2).map((g) => g.heading)).toEqual(['Today', 'Yesterday'])
    expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([[4, 3], [2], [1]])
  })
})
