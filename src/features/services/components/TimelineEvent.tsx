import { cva, cx } from 'class-variance-authority'
import { memo } from 'react'

import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { type EventDurations, transitionDurationMs } from '@/features/services/utils/timeline-durations'
import { EventHeading } from '@/features/timeline/components/EventHeading'
import { formatDuration } from '@/lib/format'
import type { ConnectionEvent, ServiceEvent, ServicesRunningEvent, ServiceTransitionEvent } from '@/types'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GlobeIcon, OfflineIcon, TimelineNode } from '@/ui'

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

// Pushed flush right of its row.
const DURATION = 'ml-auto shrink-0 whitespace-nowrap'

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
      <EventHeading title={isDown ? 'Service went down' : 'Service came back up'} ts={event.ts} />
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
      <EventHeading title={`${event.count} ${event.count === 1 ? 'service' : 'services'} running`} ts={event.ts} />
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
      <EventHeading title={isLost ? 'Internet disconnected' : 'Internet reconnected'} ts={event.ts} />
      <span className={subjectVariants({ isMuted: true, isFullWidth: true })}>
        <span>{isLost ? 'No internet connection detected.' : 'Connection restored.'}</span>
        {shouldShowDuration && (
          <span className={cx(DURATION, 'text-sm')}>Offline for {formatDuration(durationMs)}</span>
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
  return <TransitionRow event={event} durationMs={transitionDurationMs(event, durations)} />
}
