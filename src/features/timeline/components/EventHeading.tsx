// Time only, on the user's own 12- or 24-hour clock: the day heading above carries the date.
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function formatTime(ts: number): string {
  return TIME_FORMAT.format(new Date(ts))
}

/** A timeline row's first line: what happened, and the time of day it happened. */
export function EventHeading({ title, ts }: { title: string; ts: number }) {
  return (
    <span className="flex items-baseline gap-10">
      <span className="min-w-0 flex-1 type-heading-small leading-[inherit] text-primary wrap-anywhere">{title}</span>
      <time
        className="type-body-small leading-[inherit] shrink-0 whitespace-nowrap text-tertiary"
        dateTime={new Date(ts).toISOString()}
      >
        {formatTime(ts)}
      </time>
    </span>
  )
}
