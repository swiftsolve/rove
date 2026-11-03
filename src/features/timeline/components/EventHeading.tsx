// Time only, on the user's own 12- or 24-hour clock: the day heading above carries the date.
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function formatTime(ts: number): string {
  return TIME.format(new Date(ts))
}

/** A timeline row's first line: what happened, and the time of day it happened. */
export function EventHeading({ title, ts }: { title: string; ts: number }) {
  return (
    <span className="flex items-baseline gap-10">
      <span className="min-w-0 flex-1 text-lg font-semibold text-primary wrap-anywhere">{title}</span>
      <time className="shrink-0 text-sm whitespace-nowrap text-tertiary" dateTime={new Date(ts).toISOString()}>
        {formatTime(ts)}
      </time>
    </span>
  )
}
