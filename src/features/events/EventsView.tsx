import { useId, useMemo, type JSX, type ReactNode } from 'react'
import type { NetworkEvent, NetworkEventType } from '@/types'
import { formatDuration, formatMac } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { useNetworkEvents } from '@/features/events/hooks/useNetworkEvents'
import { InlineMeta } from '@/components/DotSeparator'
import { EmptyState } from '@/components/EmptyState'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { Tooltip } from '@/components/Tooltip'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EthernetIcon,
  GlobeIcon,
  HelpIcon,
  OfflineIcon,
  RefreshIcon,
  RouterIcon,
  SearchIcon,
  EventsIcon,
  ShieldAlertIcon,
  WifiIcon,
} from '@/components/icons/Icons'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'
import { cva, cx, type VariantProps } from 'class-variance-authority'

// One node on the line: a marker column and the content beside it. The marker
// column is nudged in 5px from the left so the icons aren't flush against the
// edge (the day heading stays flush). No trailing gap after a day's final node:
// the per-node padding only spaces one node from the next.
//
// The connecting line runs from just below this node down to the next one
// within the same day. It's dropped on a day's last node so the line ends at the
// final marker of each day rather than running on beside the next date heading.
// left: padding-left (5) + centre of the 28px marker column, minus half the 2px
// line. top: marker height (28) + a 2px gap so it starts below the node.
const ITEM = cx(
  'relative grid grid-cols-[28px_1fr] gap-(--section-padding) pl-[5px] not-last:pb-[22px]',
  "not-last:before:absolute not-last:before:content-['']",
  'not-last:before:top-[30px] not-last:before:bottom-0 not-last:before:left-[18px] not-last:before:w-2',
  'not-last:before:rounded-[1px] not-last:before:bg-line-strong',
)

// Every tone but a departure uses the same faint currentColor wash for its
// fill; only the glyph colour changes.
const MARKER_WASH = 'bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-md),transparent)]'

// The node sits above the connector (z-index) so the line reads as passing
// behind it, and is tinted by tone so the timeline is scannable at a glance.
const markerVariants = cva('z-1 flex size-[28px] shrink-0 items-center justify-center rounded-full', {
  variants: {
    tone: {
      /** Arrivals & connections: a device joined, came back, or linked up. */
      join: ['text-status-positive', MARKER_WASH],
      /** A departure: quiet, not alarming; a known device just dropped off. A
       *  ring outline (rather than a filled wash) reads as "hollow/gone",
       *  setting it apart from the filled arrival/change markers. */
      leave: 'bg-inset text-tertiary shadow-[inset_0_0_0_1.5px_var(--border-strong)]',
      /** The baseline snapshot: calm and neutral. */
      baseline: ['text-accent', MARKER_WASH],
      /** Cautionary: a new access point appeared (warning severity). */
      alert: ['text-status-warning', MARKER_WASH],
      /** Alarming: the gateway changed (critical severity). */
      danger: ['text-status-negative', MARKER_WASH],
    },
  },
  defaultVariants: { tone: 'baseline' },
})

// One gap value governs the spacing between every line (time, title, device,
// change, address), with no per-line margins, and every line gets the same line
// box, so the visual gap matches the flex gap and doesn't drift with each line's
// font size. Nudged down so the timestamp's cap-height lines up with the marker.
const CONTENT = 'flex min-w-0 flex-col gap-4 pt-2 *:leading-[1.3]'

// Title on the left, time pinned to the right edge on the same line. The time
// takes only the width it needs and never wraps, so a long title flows beneath
// it rather than pushing it around.
const HEAD = 'flex items-baseline gap-10'
const TITLE = 'min-w-0 flex-1 text-lg font-semibold text-primary wrap-anywhere'

const SUBJECT = 'flex-wrap text-md text-secondary'

const FEED_HINT =
  'Rove logs what changes between scans, like devices and access points joining or leaving. Events are kept for 7 days.'

const EMPTY_HINT =
  'Devices joining, leaving, or changing appear here. Run a scan to check.'

// Only the day headings need the clock, and they only turn over at midnight.
const DAY_HEADING_TICK_MS = 60_000

type IconComponent = (props: { size?: number }) => JSX.Element

// The node's colour category. The glyph says *what* happened; this tint says how
// to read it at a glance — arrivals/connections read positive (green), the
// baseline calm (blue), a departure quiet (grey), a new access point or gateway
// change cautionary (amber), a lost connection alarming (red). Warning/critical
// events keep the loud colours severity used before.
type EventTone = NonNullable<VariantProps<typeof markerVariants>['tone']>

interface EventStyle {
  icon: IconComponent
  tone: EventTone
}

interface DayGroup {
  key: string
  heading: string
  events: NetworkEvent[]
}

const EVENT_STYLES: Record<NetworkEventType, EventStyle> = {
  initial_scan: { icon: SearchIcon, tone: 'baseline' },
  device_joined: { icon: ArrowRightIcon, tone: 'join' },
  ap_appeared: { icon: RouterIcon, tone: 'alert' },
  device_offline: { icon: ArrowLeftIcon, tone: 'leave' },
  device_online: { icon: RefreshIcon, tone: 'join' },
  gateway_changed: { icon: ShieldAlertIcon, tone: 'alert' },
  wifi_connected: { icon: WifiIcon, tone: 'join' },
  ethernet_connected: { icon: EthernetIcon, tone: 'join' },
  connection_lost: { icon: OfflineIcon, tone: 'danger' },
  internet_lost: { icon: OfflineIcon, tone: 'danger' },
  internet_restored: { icon: GlobeIcon, tone: 'join' },
}

const EVENT_TITLES: Record<NetworkEventType, string> = {
  initial_scan: 'Network baseline', // overridden with the live count below
  device_joined: 'New device joined the network',
  ap_appeared: 'New access point detected',
  device_offline: 'Device left the network',
  device_online: 'Device reconnected',
  gateway_changed: 'Gateway changed',
  wifi_connected: 'Connected to Wi‑Fi',
  ethernet_connected: 'Connected to Ethernet',
  connection_lost: 'Network connection lost',
  internet_lost: 'Internet disconnected',
  internet_restored: 'Internet reconnected',
}

// Internet up/down events carry no device subject, so a short descriptive line
// stands in for the subject row to give the title context.
const INTERNET_SUBTITLES: Partial<Record<NetworkEventType, string>> = {
  internet_lost: 'No internet connection detected.',
  internet_restored: 'Connection restored.',
}

// Pair each `internet_restored` with the `internet_lost` it ended (keyed by the
// restored event's id) so the recovery row can show how long we were offline —
// the same "Offline for …" the services timeline shows. Events arrive
// newest-first, so we walk oldest-first tracking the last unmatched loss.
function offlineDurations(newestFirst: NetworkEvent[]): Map<number, number> {
  const durations = new Map<number, number>()
  let lostTs: number | null = null
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const e = newestFirst[i]!
    if (e.type === 'internet_lost') {
      lostTs = e.ts
    } else if (e.type === 'internet_restored' && lostTs != null) {
      durations.set(e.id, e.ts - lostTs)
      lostTs = null
    }
  }
  return durations
}

function subjectName(event: NetworkEvent): string {
  if (event.name) return event.name
  if (event.isRandomized) return 'Private device'
  return 'Unknown device'
}

// The device category to show beside the name — the same "Phone"/"Camera" the
// Devices view labels it with. Suppressed when the name already conveys it (an
// unnamed "Android phone" shouldn't read "Android phone · Phone") by checking
// the label's lead word against the name.
function subjectKind(event: NetworkEvent, subject: string): string | null {
  if (!event.kind || event.kind === 'unknown') return null
  const label = LAN_DEVICE_KIND_LABELS[event.kind]
  const lead = (label.split(' ')[0] ?? label).toLowerCase()
  if (subject.toLowerCase().includes(lead)) return null
  return label
}

// The baseline row's headline is built from the device count it carries in
// `newValue`, rather than a fixed string.
function initialScanTitle(event: NetworkEvent): string {
  const count = Number(event.newValue ?? 0)
  return `${count} ${count === 1 ? 'device' : 'devices'} discovered`
}

// Internet up/down events describe this machine's own WAN reachability, not a
// device — they carry a fixed descriptive subtitle instead of a device subject
// or address line (subjectName would otherwise read "Unknown device").
function isInternetEvent(event: NetworkEvent): boolean {
  return event.type === 'internet_lost' || event.type === 'internet_restored'
}

// The subject line under the title. The baseline keeps a one-line subtitle (it's
// a network-wide summary, not a device); internet events have none; every other
// event just shows the device it's about.
function eventSubject(event: NetworkEvent): string | null {
  if (event.type === 'initial_scan') return 'Tracking changes from here on'
  if (isInternetEvent(event)) return null
  return subjectName(event)
}

// The address line: MAC · Randomized · IP (any absent part is dropped). The
// baseline row is network-wide, so it has none.
function addressItems(event: NetworkEvent): ReactNode[] {
  const items: ReactNode[] = []
  if (event.type === 'initial_scan') return items
  if (event.mac) {
    items.push(<span className="num">{formatMac(event.mac)}</span>)
    if (event.isRandomized) {
      items.push(<span title="Privacy-randomized MAC address">Randomized</span>)
    }
  }
  if (event.ip) items.push(<span className="num">{event.ip}</span>)
  return items
}

// 12h time only, e.g. "1:24 PM" — the day is carried by the group heading above,
// so each node just shows the time within its day.
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** The time of day as a machine-readable `<time>`. */
function EventTime({ ts }: { ts: number }): JSX.Element {
  return (
    <time className="shrink-0 text-sm whitespace-nowrap text-tertiary" dateTime={new Date(ts).toISOString()}>
      {formatTime(ts)}
    </time>
  )
}

// A stable per-calendar-day key (local time) used to slice the feed into days.
function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// The date label for a day section: "Today" / "Yesterday" for the two most
// recent days, otherwise "Monday, 12th January" (with the year appended when
// it isn't the current one).
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

// Slice the (already time-ordered) feed into consecutive same-day runs, keeping
// the incoming order so the timeline stays continuous within each day.
function groupByDay(events: NetworkEvent[], now: number): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const key = dayKey(event.ts)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.events.push(event)
    } else {
      groups.push({ key, heading: formatDayHeading(event.ts, now), events: [event] })
    }
  }
  return groups
}

function EventIcon({ type }: { type: NetworkEventType }): JSX.Element {
  const Icon = EVENT_STYLES[type]?.icon ?? ActivityIcon
  return <Icon size={15} />
}

// An event the UI has copy for. Anything else — e.g. a row left behind by a
// retired feature — is filtered out upstream rather than shown as a placeholder,
// so `TimelineItem` only ever renders a recognized type.
function isKnownEvent(event: NetworkEvent): boolean {
  return event.type in EVENT_TITLES
}

function TimelineItem({
  event,
  offlineMs,
}: {
  event: NetworkEvent
  /** For `internet_restored`, how long we were offline before reconnecting. */
  offlineMs?: number
}): JSX.Element {
  const isInitial = event.type === 'initial_scan'
  const isInternet = isInternetEvent(event)
  const title = isInitial ? initialScanTitle(event) : EVENT_TITLES[event.type]
  const subject = eventSubject(event)
  const kindLabel = isInitial || !subject ? null : subjectKind(event, subject)
  // InlineMeta renders each separator as a dot icon.
  const metaItems = addressItems(event)

  return (
    <li className={ITEM}>
      <span className={markerVariants({ tone: EVENT_STYLES[event.type]?.tone })} aria-hidden>
        <EventIcon type={event.type} />
      </span>
      <div className={CONTENT}>
        <span className={HEAD}>
          <span className={TITLE}>{title}</span>
          <EventTime ts={event.ts} />
        </span>
        {subject && (
          <InlineMeta
            className={SUBJECT}
            // The device category after the name ("Apple · Phone"), a step quieter
            // so the name still leads.
            items={[subject, kindLabel && <span className="text-tertiary">{kindLabel}</span>]}
          />
        )}
        {isInternet && INTERNET_SUBTITLES[event.type] && (
          // Status at the left, offline duration flush right (pushed by its
          // margin-left:auto), on one line spanning the full content width.
          <span className={cx(SUBJECT, 'flex w-full')}>
            <span>{INTERNET_SUBTITLES[event.type]}</span>
            {offlineMs != null && (
              <span className="ml-auto shrink-0 text-sm whitespace-nowrap text-tertiary">Offline for {formatDuration(offlineMs)}</span>
            )}
          </span>
        )}

        {/* The address line, one step quieter than everything above it. */}
        {metaItems.length > 0 && (
          <InlineMeta
            className="flex-wrap items-center text-sm text-tertiary tabular-nums"
            items={metaItems}
          />
        )}
      </div>
    </li>
  )
}

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
        icon={ActivityIcon}
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
  const { events, isLoading, error } = useNetworkEvents()
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

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

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
