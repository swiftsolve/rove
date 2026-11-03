import type { JSX, ReactNode } from 'react'
import type { NetworkEvent, NetworkEventType } from '@/types'
import { formatDuration, formatMac } from '@/lib/format'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EthernetIcon,
  GlobeIcon,
  InlineMeta,
  OfflineIcon,
  RefreshIcon,
  RouterIcon,
  SearchIcon,
  ShieldAlertIcon,
  TimelineNode,
  Tooltip,
  WifiIcon,
  type TimelineNodeColor,
} from '@/ui'
import { cx } from 'class-variance-authority'
import {
  EVENT_TITLES,
  INTERNET_SUBTITLES,
  eventSubject,
  initialScanTitle,
  isInternetEvent,
  subjectKind,
} from '@/features/events/utils/event-copy'

// The node's colour category. The icon says *what* happened; this tint says how
// to read it at a glance.
const TONE_COLORS = {
  /** Arrivals & connections: a device joined, came back, or linked up. */
  join: 'var(--status-positive)',
  /** A departure: quiet, not alarming; a known device just dropped off. The
   *  hollow ring reads as "gone", set apart from the filled markers. */
  leave: 'neutral',
  /** The baseline snapshot: calm and neutral. */
  baseline: 'var(--accent-default)',
  /** Cautionary: a new access point appeared (warning severity). */
  alert: 'var(--status-warning)',
  /** Alarming: the gateway changed (critical severity). */
  danger: 'var(--status-negative)',
} as const satisfies Record<string, TimelineNodeColor>

type EventTone = keyof typeof TONE_COLORS

// Title on the left, time pinned to the right edge on the same line. The time
// takes only the width it needs and never wraps, so a long title flows beneath
// it rather than pushing it around.
const HEAD = 'flex items-baseline gap-10'
const TITLE = 'min-w-0 flex-1 text-lg font-semibold text-primary wrap-anywhere'

const SUBJECT = 'text-md text-secondary'

// The address line, one step quieter than everything above it.
const META = 'text-sm text-tertiary tabular-nums'

type IconComponent = (props: { size?: number }) => JSX.Element

type EventStyle = {
  icon: IconComponent
  tone: EventTone
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

// The address line: MAC · Randomized · IP (any absent part is dropped). The
// baseline row is network-wide, so it has none.
function addressItems(event: NetworkEvent): ReactNode[] {
  const items: ReactNode[] = []
  if (event.type === 'initial_scan') return items
  if (event.mac) {
    items.push(<span className="num">{formatMac(event.mac)}</span>)
    if (event.isRandomized) {
      items.push(
        <Tooltip content="Privacy-randomized MAC address">
          <span>Randomized</span>
        </Tooltip>,
      )
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
function EventTime({ ts }: { ts: number }) {
  return (
    <time className="shrink-0 text-sm whitespace-nowrap text-tertiary" dateTime={new Date(ts).toISOString()}>
      {formatTime(ts)}
    </time>
  )
}

function EventIcon({ type }: { type: NetworkEventType }) {
  const Icon = EVENT_STYLES[type].icon
  return <Icon size={15} />
}

export function TimelineItem({
  event,
  offlineMs,
}: {
  event: NetworkEvent
  /** For `internet_restored`, how long we were offline before reconnecting. */
  offlineMs?: number
}) {
  const isInitial = event.type === 'initial_scan'
  const isInternet = isInternetEvent(event)
  const title = isInitial ? initialScanTitle(event) : EVENT_TITLES[event.type]
  const subject = eventSubject(event)
  const kindLabel = isInitial || !subject ? null : subjectKind(event, subject)
  // InlineMeta renders each separator as a dot icon.
  const metaItems = addressItems(event)

  return (
    <TimelineNode icon={<EventIcon type={event.type} />} color={TONE_COLORS[EVENT_STYLES[event.type].tone]}>
      <span className={HEAD}>
        <span className={TITLE}>{title}</span>
        <EventTime ts={event.ts} />
      </span>
      {subject && (
        <div className={SUBJECT}>
          <InlineMeta
            // The device category after the name ("Apple · Phone"), a step quieter
            // so the name still leads.
            items={[subject, kindLabel && <span className="text-tertiary">{kindLabel}</span>]}
          />
        </div>
      )}
      {isInternet && INTERNET_SUBTITLES[event.type] && (
        // Status at the left, offline duration flush right (pushed by its
        // margin-left:auto), on one line spanning the full content width.
        <span className={cx(SUBJECT, 'flex w-full flex-wrap')}>
          <span>{INTERNET_SUBTITLES[event.type]}</span>
          {offlineMs != null && (
            <span className="ml-auto shrink-0 text-sm whitespace-nowrap text-tertiary">
              Offline for {formatDuration(offlineMs)}
            </span>
          )}
        </span>
      )}

      {metaItems.length > 0 && (
        <div className={META}>
          <InlineMeta items={metaItems} />
        </div>
      )}
    </TimelineNode>
  )
}
