import { useId, useMemo, type JSX } from 'react'
import type { NetworkEvent } from '@/types'
import { useNow } from '@/hooks/useNow'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { useNetworkEvents } from '@/features/events/hooks/useNetworkEvents'
import { EmptyState } from '@/components/EmptyState'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { Tooltip } from '@/components/Tooltip'
import { EventsIcon, HelpIcon } from '@/components/icons/Icons'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { TimelineItem } from '@/features/events/components/TimelineItem'
import { groupByDay, type DayGroup } from '@/features/events/utils/day-groups'
import { isKnownEvent, offlineDurations } from '@/features/events/utils/event-copy'
import { ErrorBanner, POLLING_DESCRIPTION } from '@/components/ErrorBanner'

const FEED_HINT =
  'Devices and access points joining or leaving between scans. Kept for 7 days.'

const EMPTY_HINT = 'Devices joining or leaving show up here.'

// Only the day headings need the clock, and they only turn over at midnight.
const DAY_HEADING_TICK_MS = 60_000

/** One day of the feed: its date heading over the list of that day's events. */
function TimelineDay({
  group,
  offlineDurationById,
}: {
  group: DayGroup
  offlineDurationById: Map<number, number>
}): JSX.Element {
  const headingId = useId()
  return (
    <li className="flex flex-col not-first:mt-[18px]">
      {/* The date divider: quiet, uppercase, flush with the left edge. */}
      <h2
        id={headingId}
        className="mb-(--section-padding) text-sm font-semibold tracking-[0.04em] text-tertiary uppercase"
      >
        {group.heading}
      </h2>
      <ul role="list" className="flex flex-col" aria-labelledby={headingId}>
        {group.events.map((event) => (
          <TimelineItem key={event.id} event={event} offlineMs={offlineDurationById.get(event.id)} />
        ))}
      </ul>
    </li>
  )
}

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
}): JSX.Element {
  if (events.length === 0) {
    if (isLoading) {
      return (
        <div className="page-empty" aria-busy="true">
          <Spinner />
          <p className="text-muted">Loading events…</p>
        </div>
      )
    }
    return (
      <EmptyState
        title="No events yet"
        hint={EMPTY_HINT}
        action={
          <Button onClick={onRefresh}>
            Scan now
          </Button>
        }
      />
    )
  }

  return (
    // No left pad so the marker column sits flush with the header icon; the small
    // right pad keeps timestamps off the very edge.
    <ul role="list" className="flex flex-col pt-6 pr-4 pb-8">
      {groupByDay(events, now).map((group) => (
        <TimelineDay key={group.key} group={group} offlineDurationById={offlineDurationById} />
      ))}
    </ul>
  )
}

export function EventsView(): JSX.Element {
  const { events, isLoading, error, reload } = useNetworkEvents()
  const devices = useDevices()
  // A device scan is what produces new events, so refreshing means scanning again.
  const isScanning = devices.isScanning
  const rescan = (): void => {
    void devices.rescan()
  }
  const now = useNow(DAY_HEADING_TICK_MS)
  // Only render events the UI recognizes; unknown types are skipped entirely
  // rather than surfaced as a generic row.
  const visibleEvents = useMemo(() => events.filter(isKnownEvent), [events])
  const hasEvents = visibleEvents.length > 0
  // Offline durations for the `internet_restored` rows, keyed by event id.
  const offlineDurationById = useMemo(() => offlineDurations(visibleEvents), [visibleEvents])

  return (
    <div className="page">
      <ViewHeader
        icon={<EventsIcon size={18} />}
        title="Timeline"
        subtitle={
          hasEvents ? (
            <span className="text-meta">What’s changed in the past week</span>
          ) : undefined
        }
        isSubtitleShown={hasEvents}
        actions={
          <>
            <Tooltip content={FEED_HINT}>
              <IconButton
                aria-label="About network events"
              >
                <HelpIcon size={16} />
              </IconButton>
            </Tooltip>
            <RefreshIconButton
              label="Scan for changes"
              isBusy={isScanning}
              onClick={rescan}
              busyBehavior="ignore"
            />
          </>
        }
      />

      {error && <ErrorBanner title={error} description={POLLING_DESCRIPTION} onRetry={reload} />}

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
