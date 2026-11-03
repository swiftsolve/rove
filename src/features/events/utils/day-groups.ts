import type { NetworkEvent } from '@/types'

export type DayGroup = {
  key: string
  heading: string
  events: NetworkEvent[]
}

// A stable per-calendar-day key (local time) used to slice the feed into days.
function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// The date label for a day section: "Today" / "Yesterday" for the two most
// recent days, otherwise "Monday, 12th January" (with the year appended when
// it isn't the current one).
export function formatDayHeading(ts: number, nowMs: number): string {
  const date = new Date(ts)
  const now = new Date(nowMs)
  if (dayKey(ts) === dayKey(now.getTime())) return 'Today'
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(ts) === dayKey(yesterday.getTime())) return 'Yesterday'

  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
  const month = date.toLocaleDateString(undefined, { month: 'long' })
  const base = `${weekday}, ${date.getDate()} ${month}`
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`
}

// Slice the (already time-ordered) feed into consecutive same-day runs, keeping
// the incoming order so the timeline stays continuous within each day.
export function groupByDay(events: NetworkEvent[], now: number): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const key = dayKey(event.ts)
    const last = groups[groups.length - 1]
    if (last?.key === key) {
      last.events.push(event)
    } else {
      groups.push({ key, heading: formatDayHeading(event.ts, now), events: [event] })
    }
  }
  return groups
}
