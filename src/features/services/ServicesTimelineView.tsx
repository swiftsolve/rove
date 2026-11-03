import { cva, cx } from 'class-variance-authority'
import { memo, useId, useMemo } from 'react'

import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'
import { useNavigation } from '@/app/hooks/useNavigation'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { serviceTally } from '@/features/services/components/ServiceTally'
import { useServiceHistory } from '@/features/services/hooks/useServiceHistory'
import { useServiceReachability } from '@/features/services/hooks/useServiceReachability'
import { useIncrementalCount } from '@/hooks/useIncrementalCount'
import { useNow } from '@/hooks/useNow'
import { formatDuration } from '@/lib/format'
import type { ConnectionEvent, ServiceEvent, ServicesRunningEvent, ServiceTransitionEvent } from '@/types'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  EmptyState,
  GlobeIcon,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  OfflineIcon,
  PageHeader,
  TimelineNode,
  TrashIcon,
} from '@/ui'

// Rows rendered with the page (more than the window holds), and how many more
// each step after it has settled.
const INITIAL_ROWS = 20
const ROWS_PER_STEP = 40

// The same colour language as the reachability numbers: a drop is negative, a
// recovery or healthy summary positive.
const DOWN_COLOR = 'var(--status-negative)'
const UP_COLOR = 'var(--status-positive)'

// The line under the title, as in the events feed: what happened on top, which
// service beneath.
const subjectVariants = cva('min-w-0 items-center gap-4 text-md', {
  variants: {
    /** A quiet aside (the running summary, the connection status), not a service name. */
    isMuted: { true: 'text-tertiary', false: 'text-secondary' },
    /** Spans the content width so the connection row's duration can sit flush right. */
    isFullWidth: { true: 'flex w-full', false: 'inline-flex' },
  },
  defaultVariants: { isMuted: false, isFullWidth: false },
})

const HEAD = 'flex items-baseline gap-10'
const TITLE = 'min-w-0 flex-1 text-lg font-semibold text-primary wrap-anywhere'

// Pushed flush right of its row.
const DURATION = 'ml-auto shrink-0 whitespace-nowrap'

type DayGroup = {
  key: string
  heading: string
  events: ServiceEvent[]
}

/** The precomputed durations the timeline rows read, plus the live clock. */
type EventDurations = {
  /** Closed outages, keyed by `outageKey` of the recovery. */
  outageByKey: Map<string, number>
  /** Offline spells, keyed by the "connection restored" event's ts. */
  offlineByTs: Map<number, number>
  /** When each still-down host dropped. */
  ongoingDownStartByHost: Map<string, number>
  now: number
}

// Time only, e.g. "1:24 PM": the day heading above carries the date.
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** The time of day as a machine-readable `<time>`. */
function EventTime({ ts }: { ts: number }) {
  return (
    <time className="shrink-0 text-sm whitespace-nowrap text-tertiary" dateTime={new Date(ts).toISOString()}>
      {formatTime(ts)}
    </time>
  )
}

// Local calendar day, so groups split at the user's midnight.
function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// "Today" / "Yesterday" for the two most recent days, otherwise "Monday, 12
// January" (with the year appended when it isn't the current one).
function formatDayHeading(ts: number, nowMs: number): string {
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

// Slice the (already newest-first) feed into consecutive same-day runs, keeping
// the incoming order so the timeline stays continuous within each day.
function groupByDay(events: ServiceEvent[], now: number): DayGroup[] {
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

function outageKey(host: string, ts: number): string {
  return `${host}:${ts}`
}

// Pair each recovery with the outage it ended, keyed by `outageKey`, so a
// "came back up" row can show how long the service was down. Walks the log
// oldest-first, tracking the last `down` per host.
function outageDurations(newestFirst: ServiceEvent[]): Map<string, number> {
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

// When each still-down host dropped, for the live "Down for …" on its latest
// drop. Events are newest-first, so the first transition per host is its latest.
function ongoingDownStarts(newestFirst: ServiceEvent[]): Map<string, number> {
  const starts = new Map<string, number>()
  const seen = new Set<string>()
  for (const e of newestFirst) {
    if (e.type !== 'transition' || seen.has(e.host)) continue
    seen.add(e.host)
    if (e.status === 'down') starts.set(e.host, e.ts)
  }
  return starts
}

// Pair each "connection restored" with the "lost" it ended, keyed by the
// restored event's ts, so the recovery row can show how long we were offline.
function offlineDurations(newestFirst: ServiceEvent[]): Map<number, number> {
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

function eventKey(event: ServiceEvent): string {
  if (event.type === 'running') return `running:${event.ts}`
  if (event.type === 'connection') return `connection:${event.status}:${event.ts}`
  return `${event.host}:${event.ts}:${event.status}`
}

// The rows are memoised: the clock ticks every second, and only a row whose
// duration it moves should re-render, not a few hundred of them.
const TransitionRow = memo(function TransitionRow({
  event,
  durationMs,
}: {
  event: ServiceTransitionEvent
  durationMs: number | undefined
}) {
  const isDown = event.status === 'down'
  const shouldShowDuration = durationMs != null

  return (
    <TimelineNode
      icon={isDown ? <ArrowDownIcon size={15} /> : <ArrowUpIcon size={15} />}
      color={isDown ? DOWN_COLOR : UP_COLOR}
    >
      <span className={HEAD}>
        <span className={TITLE}>{isDown ? 'Service went down' : 'Service came back up'}</span>
        <EventTime ts={event.ts} />
      </span>
      <span className={subjectVariants()}>
        <ServiceIcon host={event.host} name={event.name} />
        <span className="truncate">{event.name}</span>
      </span>
      <span className="flex items-baseline gap-10 text-sm text-tertiary">
        <span className="min-w-0 truncate">{event.host}</span>
        {shouldShowDuration && <span className={DURATION}>Down for {formatDuration(durationMs)}</span>}
      </span>
    </TimelineNode>
  )
})

const RunningRow = memo(function RunningRow({ event }: { event: ServicesRunningEvent }) {
  // A baseline recorded while a service was already down is a partial tally, so
  // the subtext names the denominator rather than calling it all-clear.
  const areAllHealthy = event.count >= event.total

  return (
    <TimelineNode icon={<CheckIcon size={15} />} color={UP_COLOR}>
      <span className={HEAD}>
        <span className={TITLE}>
          {event.count} {event.count === 1 ? 'service' : 'services'} running
        </span>
        <EventTime ts={event.ts} />
      </span>
      <span className={subjectVariants({ isMuted: true })}>
        {areAllHealthy ? 'All services healthy' : `${event.count} of ${event.total} services healthy`}
      </span>
    </TimelineNode>
  )
})

/** This machine's own network dropping or returning. Stands in for the wall of
 *  per-service "down"s the probes would otherwise produce while we're offline. */
const ConnectionRow = memo(function ConnectionRow({
  event,
  durationMs,
}: {
  event: ConnectionEvent
  durationMs: number | undefined
}) {
  const isLost = event.status === 'lost'
  const shouldShowDuration = !isLost && durationMs != null

  return (
    <TimelineNode
      icon={isLost ? <OfflineIcon size={15} /> : <GlobeIcon size={15} />}
      color={isLost ? DOWN_COLOR : UP_COLOR}
    >
      <span className={HEAD}>
        <span className={TITLE}>{isLost ? 'Internet disconnected' : 'Internet reconnected'}</span>
        <EventTime ts={event.ts} />
      </span>
      <span className={subjectVariants({ isMuted: true, isFullWidth: true })}>
        <span>{isLost ? 'No internet connection detected.' : 'Connection restored.'}</span>
        {shouldShowDuration && (
          <span className={cx(DURATION, 'text-sm')}>Offline for {formatDuration(durationMs)}</span>
        )}
      </span>
    </TimelineNode>
  )
})

/** The header overflow menu: Clear history, which drops everything recorded. */
function TimelineMenu({ onClear }: { onClear: () => void }) {
  return (
    <Menu>
      <MenuTrigger label="Timeline options" />
      <MenuContent>
        <MenuItem icon={TrashIcon} tone="negative" onClick={onClear}>
          Clear history
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

// "Down for …" on a recovery is the outage it closed; on the latest drop of a
// still-down service it's the live elapsed time since then. Older drops get none.
function transitionDurationMs(event: ServiceTransitionEvent, durations: EventDurations): number | undefined {
  if (event.status === 'up') return durations.outageByKey.get(outageKey(event.host, event.ts))
  if (durations.ongoingDownStartByHost.get(event.host) === event.ts) return durations.now - event.ts
  return undefined
}

function TimelineEvent({ event, durations }: { event: ServiceEvent; durations: EventDurations }) {
  if (event.type === 'running') return <RunningRow event={event} />
  if (event.type === 'connection') {
    return <ConnectionRow event={event} durationMs={durations.offlineByTs.get(event.ts)} />
  }
  return <TransitionRow event={event} durationMs={transitionDurationMs(event, durations)} />
}

/** One day of the timeline: its date heading over the list of that day's events. */
function TimelineDay({ group, durations }: { group: DayGroup; durations: EventDurations }) {
  const headingId = useId()
  return (
    <li className="flex flex-col not-first:mt-[18px]">
      <h2
        id={headingId}
        className="mb-(--card-padding) text-sm font-semibold tracking-[0.04em] text-tertiary uppercase"
      >
        {group.heading}
      </h2>
      <ul role="list" className="flex flex-col" aria-labelledby={headingId}>
        {group.events.map((event) => (
          <TimelineEvent key={eventKey(event)} event={event} durations={durations} />
        ))}
      </ul>
    </li>
  )
}

/**
 * Service outages and recoveries, newest first and grouped by day.
 *
 * The backend's always-on heartbeat records the log (see `service_events`), so it
 * covers outages while the window was closed. Live probes only feed the header tally.
 */
export function ServicesTimelineView() {
  const { back } = useNavigation()
  const reachability = useServiceReachability().report?.services
  // The title bar's live status: offline, every probe fails at once, and that's
  // our fault, not the services'.
  const liveInternet = useConnectionStatus().internet
  const { events, isLoaded, clear } = useServiceHistory()
  // A full log is a few hundred rows: render the first screenful with the page
  // and the rest once it has settled in.
  const shownCount = useIncrementalCount(events.length, INITIAL_ROWS, ROWS_PER_STEP)

  const outageByKey = useMemo(() => outageDurations(events), [events])
  const offlineByTs = useMemo(() => offlineDurations(events), [events])
  const ongoingDownStartByHost = useMemo(() => ongoingDownStarts(events), [events])
  // Ticks each second, the finest unit `formatDuration` renders.
  const now = useNow()
  const durations: EventDurations = { outageByKey, offlineByTs, ongoingDownStartByHost, now }

  // Prose until the first probes land and there's something to count.
  const description = serviceTally(reachability, liveInternet) ?? 'When your services went down and came back.'

  const handleClear = (): void => {
    void clear()
  }

  return (
    <div className="page">
      <PageHeader
        title="Services Timeline"
        description={description}
        onBack={back}
        actions={events.length > 0 ? <TimelineMenu onClear={handleClear} /> : undefined}
      />
      {/* Nothing until the first read lands, so "No outages yet" doesn't flash
          before the log arrives. */}
      {!isLoaded ? null : events.length === 0 ? (
        <EmptyState title="No outages yet" description="Outages appear here when a tracked service goes down." />
      ) : (
        <ul role="list" className="flex flex-col pt-6 pr-4 pb-8">
          {groupByDay(events.slice(0, shownCount), now).map((group) => (
            <TimelineDay key={group.key} group={group} durations={durations} />
          ))}
        </ul>
      )}
    </div>
  )
}
