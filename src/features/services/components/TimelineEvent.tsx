import { cva, cx } from 'class-variance-authority'
import { memo } from 'react'

import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { closedOutageMs, type EventDurations, isOngoingDrop } from '@/features/services/utils/timeline-durations'
import { EventHeading } from '@/features/timeline/components/EventHeading'
import { useNow } from '@/hooks/useNow'
import type { ConnectionEvent, ServiceEvent, ServicesRunningEvent, ServiceTransitionEvent } from '@/types'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GlobeIcon, NoValue, OfflineIcon, TimelineNode } from '@/ui'
import { formatCount, formatDuration } from '@/utils/format'

// The same colour language as the reachability numbers: a drop is negative, a
// recovery or healthy summary positive.
const DOWN_COLOR = 'var(--status-negative)'
const UP_COLOR = 'var(--status-positive)'

// The line under the title, as in the events feed: what happened on top, which
// service beneath.
const subjectVariants = cva('type-body-default min-w-0 items-center gap-4', {
  variants: {
    /** A quiet aside (the running summary, the connection status), not a service name. */
    isMuted: { true: 'text-tertiary', false: 'text-secondary' },
    /** Spans the content width so the connection row's duration can sit flush right. */
    isFullWidth: { true: 'flex w-full', false: 'inline-flex' },
  },
  defaultVariants: { isMuted: false, isFullWidth: false },
})

const DURATION = 'ml-auto shrink-0 whitespace-nowrap'

// The rows are memoised, so a list a few hundred long renders each row once.
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
      <EventHeading title={isDown ? 'Service went down' : 'Service came back up'} ts={event.ts} />
      <span className={subjectVariants()}>
        <ServiceIcon host={event.host} name={event.name} />
        <span className="truncate">{event.name}</span>
      </span>
      <span className="type-body-small flex items-baseline gap-10 text-tertiary">
        <span className="min-w-0 truncate">{event.host}</span>
        {shouldShowDuration && (
          <span className={DURATION}>Down for {formatDuration(durationMs) ?? <NoValue label="Unknown" />}</span>
        )}
      </span>
    </TimelineNode>
  )
})

/**
 * The latest drop of a service still down: the one row that reads the clock,
 * so only it re-renders as its "Down for …" ticks each second, the finest
 * unit `formatDuration` renders.
 */
function OngoingDropRow({ event }: { event: ServiceTransitionEvent }) {
  const now = useNow()
  return <TransitionRow event={event} durationMs={now - event.ts} />
}

const RunningRow = memo(function RunningRow({ event }: { event: ServicesRunningEvent }) {
  // A baseline recorded while a service was already down is a partial tally, so
  // the subtext names the denominator rather than calling it all-clear.
  const areAllHealthy = event.count >= event.total

  return (
    <TimelineNode icon={<CheckIcon size={15} />} color={UP_COLOR}>
      <EventHeading title={`${formatCount(event.count, 'service')} running`} ts={event.ts} />
      <span className={subjectVariants({ isMuted: true })}>
        {areAllHealthy ? 'All services healthy' : `${event.count} of ${event.total} services healthy`}
      </span>
    </TimelineNode>
  )
})

/**
 * This machine's own network dropping or returning. Stands in for the wall of
 * per-service "down"s the probes would otherwise produce while we're offline.
 */
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
      <EventHeading title={isLost ? 'Internet disconnected' : 'Internet reconnected'} ts={event.ts} />
      <span className={subjectVariants({ isMuted: true, isFullWidth: true })}>
        <span>{isLost ? 'No internet connection detected.' : 'Connection restored.'}</span>
        {shouldShowDuration && (
          <span className={cx(DURATION, 'type-body-small leading-[inherit]')}>
            Offline for {formatDuration(durationMs) ?? <NoValue label="Unknown" />}
          </span>
        )}
      </span>
    </TimelineNode>
  )
})

/** One row of the services timeline, by the kind of event. */
export function TimelineEvent({ event, durations }: { event: ServiceEvent; durations: EventDurations }) {
  if (event.type === 'running') return <RunningRow event={event} />
  if (event.type === 'connection') {
    return <ConnectionRow event={event} durationMs={durations.offlineByTs.get(event.ts)} />
  }
  if (isOngoingDrop(event, durations)) return <OngoingDropRow event={event} />
  return <TransitionRow event={event} durationMs={closedOutageMs(event, durations)} />
}
