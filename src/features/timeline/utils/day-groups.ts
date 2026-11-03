import type { NetworkEvent } from '@/types'

export type DayGroup = {
  key: string
  heading: string
  events: NetworkEvent[]
}

// Local time, so days split at the user's midnight.
function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// "Today", "Yesterday", else e.g. "Monday, 12th January" (plus the year if not this one).
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

// Consecutive same-day runs of the already-ordered feed, order kept.
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
