/** A run of same-day entries under its heading ("Today", "Monday, January 12"). */
export type DayGroup<T> = {
  key: string
  heading: string
  events: T[]
}

// Local time, so days split at the user's midnight.
function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// The user's locale orders the parts: "Monday, January 12" in the US,
// "Monday 12 January" in the UK.
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const DAY_WITH_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** "Today", "Yesterday", else the weekday and date (plus the year if not this one). */
export function formatDayHeading(ts: number, nowMs: number): string {
  const date = new Date(ts)
  const now = new Date(nowMs)
  if (dayKey(ts) === dayKey(nowMs)) return 'Today'
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(ts) === dayKey(yesterday.getTime())) return 'Yesterday'

  return (date.getFullYear() === now.getFullYear() ? DAY_FORMAT : DAY_WITH_YEAR_FORMAT).format(date)
}

/** Consecutive same-day runs of the already-ordered feed, order kept. */
export function groupByDay<T extends { ts: number }>(events: T[], nowMs: number): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const event of events) {
    const key = dayKey(event.ts)
    const last = groups.at(-1)
    if (last?.key === key) {
      last.events.push(event)
    } else {
      groups.push({ key, heading: formatDayHeading(event.ts, nowMs), events: [event] })
    }
  }
  return groups
}
