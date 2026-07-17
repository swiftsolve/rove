import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ConnectionEvent,
  InternetStatus,
  ServiceEvent,
  ServiceReachability,
  ServicesRunningEvent,
  ServiceTransitionEvent,
} from '@/types'
import Subpage from '@/components/ui/Subpage'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { serviceTally } from '@/components/diagnostics/ServiceTally'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  GlobeIcon,
  HistoryIcon,
  MoreIcon,
  OfflineIcon,
  TrashIcon,
} from '@/components/ui/Icons'
import { formatDuration } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { useServiceHistory } from '@/hooks/useServiceHistory'
import './ServicesTimelinePage.css'

// 12h time only, e.g. "1:24 PM" — the day is carried by the group heading above.
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// A stable per-calendar-day key (local time) used to slice the feed into days.
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

interface DayGroup {
  readonly key: string
  readonly heading: string
  readonly events: readonly ServiceEvent[]
}

// Slice the (already newest-first) feed into consecutive same-day runs, keeping
// the incoming order so the timeline stays continuous within each day.
function groupByDay(events: readonly ServiceEvent[], now: number): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const key = dayKey(event.ts)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      ;(last.events as ServiceEvent[]).push(event)
    } else {
      groups.push({ key, heading: formatDayHeading(event.ts, now), events: [event] })
    }
  }
  return groups
}

// Pair each recovery with the outage it ended, keyed by `${host}:${ts}`, so a
// "came back up" row can show how long the service was down. Walks the log
// oldest-first, tracking the last `down` per host.
function outageDurations(newestFirst: readonly ServiceEvent[]): Map<string, number> {
  const durations = new Map<string, number>()
  const downAt = new Map<string, number>()
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const e = newestFirst[i]!
    if (e.type !== 'transition') continue
    if (e.status === 'down') {
      downAt.set(e.host, e.ts)
    } else {
      const start = downAt.get(e.host)
      if (start != null) {
        durations.set(`${e.host}:${e.ts}`, e.ts - start)
        downAt.delete(e.host)
      }
    }
  }
  return durations
}

// The still-open outage per host: if a host's most recent transition is a `down`
// with no later `up`, its start ts — so the "went down" row can show a live
// "Down for …" until it recovers. Events are newest-first, so the first
// transition seen per host is its latest.
function ongoingDownStarts(newestFirst: readonly ServiceEvent[]): Map<string, number> {
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
function offlineDurations(newestFirst: readonly ServiceEvent[]): Map<number, number> {
  const durations = new Map<number, number>()
  let lostAt: number | null = null
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const e = newestFirst[i]!
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

// A stable key per event for React lists and the duration lookup.
function eventKey(event: ServiceEvent): string {
  if (event.type === 'running') return `running:${event.ts}`
  if (event.type === 'connection') return `connection:${event.status}:${event.ts}`
  return `${event.host}:${event.ts}:${event.status}`
}

function TransitionRow({
  event,
  durationMs,
}: {
  readonly event: ServiceTransitionEvent
  readonly durationMs: number | undefined
}): JSX.Element {
  const down = event.status === 'down'
  // "Down for …" on a recovery is the outage it closed; on a still-down service
  // it's the live elapsed time since it dropped.
  const showDuration = durationMs != null

  return (
    <div className="stl-item">
      <span className={`stl-marker ${down ? 'is-down' : 'is-up'}`} aria-hidden>
        {down ? <ArrowDownIcon size={15} /> : <ArrowUpIcon size={15} />}
      </span>
      <div className="stl-content">
        <span className="stl-head">
          <span className="stl-title">{down ? 'Service went down' : 'Service came back up'}</span>
          <span className="stl-time">{formatTime(event.ts)}</span>
        </span>
        <span className="stl-subject">
          <ServiceIcon host={event.host} name={event.name} />
          <span className="stl-subject-name">{event.name}</span>
        </span>
        <span className="stl-meta">
          <span className="stl-meta-host">{event.host}</span>
          {showDuration && (
            <span className="stl-meta-duration">Down for {formatDuration(durationMs)}</span>
          )}
        </span>
      </div>
    </div>
  )
}

function RunningRow({ event }: { readonly event: ServicesRunningEvent }): JSX.Element {
  // A recovery summary covers every service, but a baseline recorded while one
  // was already down does not — so the subtext names the denominator rather than
  // calling a partial tally all-clear.
  const allHealthy = event.count >= event.total

  return (
    <div className="stl-item">
      <span className="stl-marker is-running" aria-hidden>
        <CheckIcon size={15} />
      </span>
      <div className="stl-content">
        <span className="stl-head">
          <span className="stl-title">
            {event.count} {event.count === 1 ? 'service' : 'services'} running
          </span>
          <span className="stl-time">{formatTime(event.ts)}</span>
        </span>
        <span className="stl-subject stl-subject-muted">
          {allHealthy
            ? 'All services healthy'
            : `${event.count} of ${event.total} services healthy`}
        </span>
      </div>
    </div>
  )
}

/** This machine's own network dropping or returning. Stands in for the wall of
 *  per-service "down"s the probes would otherwise produce while we're offline. */
function ConnectionRow({
  event,
  durationMs,
}: {
  readonly event: ConnectionEvent
  readonly durationMs: number | undefined
}): JSX.Element {
  const lost = event.status === 'lost'
  const showDuration = !lost && durationMs != null

  return (
    <div className="stl-item">
      <span className={`stl-marker ${lost ? 'is-down' : 'is-up'}`} aria-hidden>
        {lost ? <OfflineIcon size={15} /> : <GlobeIcon size={15} />}
      </span>
      <div className="stl-content">
        <span className="stl-head">
          <span className="stl-title">{lost ? 'Internet disconnected' : 'Internet reconnected'}</span>
          <span className="stl-time">{formatTime(event.ts)}</span>
        </span>
        {/* Status on the left, offline duration flush right — both on one line. */}
        <span className="stl-subject stl-subject-muted stl-conn-line">
          <span>{lost ? 'No internet connection detected.' : 'Connection restored.'}</span>
          {showDuration && (
            <span className="stl-meta-duration">Offline for {formatDuration(durationMs)}</span>
          )}
        </span>
      </div>
    </div>
  )
}

/** The header overflow menu: a kebab that opens a dropdown with Clear (drop all
 *  recorded history). Closes on outside click or Escape. Mirrors SpeedHistory. */
function TimelineMenu({ onClear }: { readonly onClear: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="stl-menu" ref={ref}>
      <button
        type="button"
        className="stl-kebab"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Timeline options"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon size={16} />
      </button>
      {open && (
        <div className="stl-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="stl-menuitem is-danger"
            onClick={() => {
              setOpen(false)
              onClear()
            }}
          >
            <TrashIcon size={14} />
            Clear history
          </button>
        </div>
      )}
    </div>
  )
}

interface ServicesTimelinePageProps {
  /** The latest reachability probes, for the up/down count in the header. */
  readonly reachability: readonly ServiceReachability[] | undefined
  /** This machine's own internet reachability, for the header tally: with no
   *  connection every probe fails at once, which is ours to own, not theirs. */
  readonly internet: InternetStatus | undefined
  readonly onBack: () => void
}

/**
 * A timeline of service outages and recoveries: when each tracked service went
 * down and when it came back, newest first and grouped by day.
 *
 * The log itself is the backend's (see `service_events`), recorded by the
 * always-on services heartbeat rather than by this page — so it covers outages
 * that happened while the window was closed, which the old frontend-owned log
 * could never see. The live probes this page receives only feed the header
 * tally.
 */
export function ServicesTimelinePage({
  reachability,
  internet,
  onBack,
}: ServicesTimelinePageProps): JSX.Element {
  const { events, clear } = useServiceHistory()

  const durations = useMemo(() => outageDurations(events), [events])
  const offlineDur = useMemo(() => offlineDurations(events), [events])
  const ongoingDownStart = useMemo(() => ongoingDownStarts(events), [events])
  // The live "Down for …" on open outages, and the day headings. Ticks at the
  // second, because that's the finest unit `formatDuration` renders.
  const now = useNow()

  // The current up/down tally, straight from the live probes. Until the first
  // probes land there's nothing to count, so the header falls back to prose.
  const subtitle = serviceTally(reachability, internet) ?? 'When your services went down and came back.'

  const handleClear = (): void => {
    void clear()
  }

  return (
    <Subpage
      title="Services Timeline"
      description={subtitle}
      onBack={onBack}
      action={events.length > 0 ? <TimelineMenu onClear={handleClear} /> : undefined}
    >
      {events.length === 0 ? (
        <div className="view-empty stl-empty">
          <HistoryIcon size={28} className="stl-empty-icon" />
          <p className="stl-empty-title">No outages recorded yet</p>
          <p className="text-muted stl-empty-hint">
            When a tracked service goes down or comes back, it shows up here. Rove records changes
            while the Connection tab is open.
          </p>
        </div>
      ) : (
        <div className="stl-timeline">
          {groupByDay(events, now).map((group) => (
            <section className="stl-day" key={group.key}>
              <h2 className="stl-day-heading">{group.heading}</h2>
              {group.events.map((event) =>
                event.type === 'running' ? (
                  <RunningRow key={eventKey(event)} event={event} />
                ) : event.type === 'connection' ? (
                  <ConnectionRow
                    key={eventKey(event)}
                    event={event}
                    durationMs={offlineDur.get(event.ts)}
                  />
                ) : (
                  <TransitionRow
                    key={eventKey(event)}
                    event={event}
                    durationMs={
                      event.status === 'up'
                        ? durations.get(`${event.host}:${event.ts}`)
                        : ongoingDownStart.get(event.host) === event.ts
                          ? now - event.ts
                          : undefined
                    }
                  />
                ),
              )}
            </section>
          ))}
        </div>
      )}
    </Subpage>
  )
}
