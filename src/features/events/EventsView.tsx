import { useMemo, type JSX, type ReactNode } from 'react'
import type { NetworkEvent, NetworkEventType } from '@/types'
import { formatDuration, formatMac } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { useAppData } from '@/app/hooks/useAppData'
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
import { cx } from '@/lib/cx'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'
import { cva, type VariantProps } from 'class-variance-authority'
import styles from './EventsView.module.css'

const markerVariants = cva([styles.marker, styles.hasTone], {
  variants: {
    tone: {
      join: styles.toneJoin,
      leave: styles.toneLeave,
      baseline: styles.toneBaseline,
      alert: styles.toneAlert,
      danger: styles.toneDanger,
    },
  },
  defaultVariants: { tone: 'baseline' },
})

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
    <div className={styles.item}>
      <span className={markerVariants({ tone: EVENT_STYLES[event.type]?.tone })} aria-hidden>
        <EventIcon type={event.type} />
      </span>
      <div className={styles.content}>
        <span className={styles.head}>
          <span className={styles.title}>{title}</span>
          <span className={styles.time}>{formatTime(event.ts)}</span>
        </span>
        {subject && (
          <InlineMeta
            className={styles.subject}
            items={[subject, kindLabel && <span className={styles.subjectKind}>{kindLabel}</span>]}
          />
        )}
        {isInternet && INTERNET_SUBTITLES[event.type] && (
          <span className={cx(styles.subject, styles.connLine)}>
            <span>{INTERNET_SUBTITLES[event.type]}</span>
            {offlineMs != null && (
              <span className={styles.connDuration}>Offline for {formatDuration(offlineMs)}</span>
            )}
          </span>
        )}

        {metaItems.length > 0 && <InlineMeta className={styles.meta} items={metaItems} />}
      </div>
    </div>
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
        <div className="view-empty">
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
    <div className={styles.timeline}>
      {groupByDay(events, now).map((group) => (
        <section className={styles.day} key={group.key}>
          <h2 className={styles.dayHeading}>{group.heading}</h2>
          {group.events.map((event) => (
            <TimelineItem key={event.id} event={event} offlineMs={offlineDurationById.get(event.id)} />
          ))}
        </section>
      ))}
    </div>
  )
}

export function EventsView(): JSX.Element {
  const { events: eventsData, devices } = useAppData().screens
  const { events, isLoading, error } = eventsData
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
    <div className="view-page">
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

      {error && <div className="error-banner">{error}</div>}

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
