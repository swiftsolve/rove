import { type ReactNode, useId } from 'react'

/** The day-grouped feed: TimelineDays, newest first. No left pad, so the markers line up with the header icon. */
export function TimelineDayList({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="flex flex-col pt-6 pr-4 pb-8">
      {children}
    </ul>
  )
}

/** One day of a timeline: its date heading over the list of that day's events. */
export function TimelineDay({ heading, children }: { heading: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <li className="flex flex-col not-first:mt-[18px]">
      <h2
        id={headingId}
        className="mb-(--card-padding) text-sm font-semibold tracking-[0.04em] text-tertiary uppercase"
      >
        {heading}
      </h2>
      <ul role="list" className="flex flex-col" aria-labelledby={headingId}>
        {children}
      </ul>
    </li>
  )
}
