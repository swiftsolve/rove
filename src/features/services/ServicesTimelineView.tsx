import { useMemo } from 'react'

import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'
import { useNavigation } from '@/app/hooks/useNavigation'
import { serviceTally } from '@/features/services/components/ServiceTally'
import { TimelineEvent } from '@/features/services/components/TimelineEvent'
import { useServiceHistory } from '@/features/services/hooks/useServiceHistory'
import { useServiceReachability } from '@/features/services/hooks/useServiceReachability'
import {
  type EventDurations,
  eventKey,
  offlineDurations,
  ongoingDownStarts,
  outageDurations,
} from '@/features/services/utils/timeline-durations'
import { TimelineDay, TimelineDayList } from '@/features/timeline/components/TimelineDay'
import { groupByDay } from '@/features/timeline/utils/day-groups'
import { useIncrementalCount } from '@/hooks/useIncrementalCount'
import { useNow } from '@/hooks/useNow'
import { Banner, EmptyState, Menu, MenuContent, MenuItem, MenuTrigger, PageHeader, TrashIcon } from '@/ui'

// Rows rendered with the page (more than the window holds), and how many more
// each step after it has settled.
const INITIAL_ROWS = 20
const ROWS_PER_STEP = 40

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
  const { events, isLoaded, clear, clearError } = useServiceHistory()
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
      {clearError && (
        <Banner variant="error" title={clearError} description="The timeline is as it was." onRetry={clear} />
      )}
      {/* Nothing until the first read lands, so "No outages yet" doesn't flash
          before the log arrives. */}
      {!isLoaded ? null : events.length === 0 ? (
        <EmptyState title="No outages yet" description="Outages appear here when a tracked service goes down." />
      ) : (
        <TimelineDayList>
          {groupByDay(events.slice(0, shownCount), now).map((group) => (
            <TimelineDay key={group.key} heading={group.heading}>
              {group.events.map((event) => (
                <TimelineEvent key={eventKey(event)} event={event} durations={durations} />
              ))}
            </TimelineDay>
          ))}
        </TimelineDayList>
      )}
    </div>
  )
}
