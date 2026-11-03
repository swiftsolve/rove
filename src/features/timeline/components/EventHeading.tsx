// Time only: the day heading above carries the date.
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
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
