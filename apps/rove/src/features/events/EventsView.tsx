import {
  Banner,
  Button,
  EmptyState,
  EventsIcon,
  IconButton,
  LoadingState,
  PageHeader,
  RefreshIcon,
} from '@swiftsolve/rove-ui'
import { useMemo } from 'react'

import { useDevices } from '@/features/devices/hooks/useDevices'
import { TimelineItem } from '@/features/events/components/TimelineItem'
import { useNetworkEvents } from '@/features/events/hooks/useNetworkEvents'
import { isKnownEvent, offlineDurations } from '@/features/events/utils/event-copy'
import { TimelineDay, TimelineDayList } from '@/features/timeline/components/TimelineDay'
import { groupByDay } from '@/features/timeline/utils/day-groups'
import { useNow } from '@/hooks/useNow'
import type { NetworkEvent } from '@/types'
import { POLLING_DESCRIPTION } from '@/utils/copy'

const FEED_HINT = 'Devices and access points joining or leaving between scans. Kept for 7 days.'

const EMPTY_HINT = 'Devices joining or leaving show up here.'

// Only the day headings need the clock, and they only turn over at midnight.
const DAY_HEADING_TICK_MS = 60_000

/** The day-grouped feed, or its loading / empty placeholder. */
function EventsFeed({
  events,
  isLoading,
  offlineDurationById,
  now,
  onRefresh,
}: {
  events: NetworkEvent[]
  isLoading: boolean
  offlineDurationById: Map<number, number>
  now: number
  onRefresh: () => void
}) {
  if (events.length === 0) {
    if (isLoading) {
      return <LoadingState label="Loading events…" />
    }
    return (
      <EmptyState
        title="No events yet"
        description={EMPTY_HINT}
        actions={<Button onClick={onRefresh}>Scan now</Button>}
      />
    )
  }

  return (
    <TimelineDayList>
      {groupByDay(events, now).map((group) => (
        <TimelineDay key={group.key} heading={group.heading}>
          {group.events.map((event) => (
            <TimelineItem key={event.id} event={event} offlineMs={offlineDurationById.get(event.id)} />
          ))}
        </TimelineDay>
      ))}
    </TimelineDayList>
  )
}

export function EventsView() {
  const { events, isLoading, error, reload } = useNetworkEvents()
  const devices = useDevices()
  // A device scan is what produces new events, so refreshing means scanning again.
  const isScanning = devices.isScanning
  const rescan = (): void => {
    void devices.rescan()
  }
  const now = useNow(DAY_HEADING_TICK_MS)
  const visibleEvents = useMemo(() => events.filter(isKnownEvent), [events])
  const hasEvents = visibleEvents.length > 0
  const offlineDurationById = useMemo(() => offlineDurations(visibleEvents), [visibleEvents])

  return (
    <div className="page">
      <PageHeader
        icon={<EventsIcon size={18} />}
        title="Timeline"
        description={
          hasEvents ? <span className="type-caption text-tertiary">What’s changed in the past week</span> : undefined
        }
        actions={
          <IconButton
            label={isScanning ? 'Refreshing…' : 'Refresh'}
            icon={RefreshIcon}
            isLoading={isScanning}
            onClick={rescan}
          />
        }
        info={{ label: 'About network events', hint: FEED_HINT }}
      />

      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

      <EventsFeed
        events={visibleEvents}
        isLoading={isLoading}
        offlineDurationById={offlineDurationById}
        now={now}
        onRefresh={rescan}
      />
    </div>
  )
}
