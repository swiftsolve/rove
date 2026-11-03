import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import {
  EVENT_TITLES,
  eventSubject,
  initialScanTitle,
  INTERNET_SUBTITLES,
  isInternetEvent,
  subjectKind,
  subjectParts,
} from '@/features/events/utils/event-copy'
import { EventHeading } from '@/features/timeline/components/EventHeading'
import type { NetworkEvent, NetworkEventType } from '@/types'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EthernetIcon,
  GlobeIcon,
  type IconComponent,
  InlineMeta,
  NoValue,
  OfflineIcon,
  RefreshIcon,
  RouterIcon,
  SearchIcon,
  ShieldAlertIcon,
  TimelineNode,
  type TimelineNodeColor,
  Tooltip,
  WifiIcon,
} from '@/ui'
import { formatDuration, formatMac } from '@/utils/format'

// The icon says what happened; the tint says how to read it.
const TONE_COLORS = {
  /** Arrivals & connections: a device joined, came back, or linked up. */
  join: 'var(--status-positive)',
  /**
   * A departure: quiet, not alarming; a known device just dropped off. The
   * hollow ring reads as "gone", set apart from the filled markers.
   */
  leave: 'neutral',
  /** The baseline snapshot. */
  baseline: 'var(--accent-default)',
  /** Cautionary: a new access point appeared (warning severity). */
  alert: 'var(--status-warning)',
  /** Alarming: the gateway changed (critical severity). */
  danger: 'var(--status-negative)',
} as const satisfies Record<string, TimelineNodeColor>

type EventTone = keyof typeof TONE_COLORS

const SUBJECT = 'text-md text-secondary'

const META = 'text-sm text-tertiary tabular-nums'

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
  gateway_changed: { icon: ShieldAlertIcon, tone: 'danger' },
  wifi_connected: { icon: WifiIcon, tone: 'join' },
  ethernet_connected: { icon: EthernetIcon, tone: 'join' },
  connection_lost: { icon: OfflineIcon, tone: 'danger' },
  internet_lost: { icon: OfflineIcon, tone: 'danger' },
  internet_restored: { icon: GlobeIcon, tone: 'join' },
}

// The network-wide baseline row has no address line.
function addressItems(event: NetworkEvent): ReactNode[] {
  const items: ReactNode[] = []
  if (event.type === 'initial_scan') return items
  if (event.mac) {
    items.push(<span className="num">{formatMac(event.mac) ?? <NoValue />}</span>)
    if (event.isRandomized) {
      items.push(
        // A span can't take focus, so the hint is spoken from the text, not the tooltip.
        <Tooltip content="Privacy-randomized MAC address" shouldDescribe={false}>
          <span>
            <span aria-hidden>Randomized</span>
            <span className="sr-only">Privacy-randomized MAC address</span>
          </span>
        </Tooltip>,
      )
    }
  }
  if (event.ip) items.push(<span className="num">{event.ip}</span>)
  return items
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
  const metaItems = addressItems(event)

  return (
    <TimelineNode icon={<EventIcon type={event.type} />} color={TONE_COLORS[EVENT_STYLES[event.type].tone]}>
      <EventHeading title={title} ts={event.ts} />
      {subject && (
        <div className={SUBJECT}>
          <InlineMeta
            items={[...subjectParts(subject), kindLabel && <span className="text-tertiary">{kindLabel}</span>]}
          />
        </div>
      )}
      {isInternet && INTERNET_SUBTITLES[event.type] && (
        <span className={cx(SUBJECT, 'flex w-full flex-wrap')}>
          <span>{INTERNET_SUBTITLES[event.type]}</span>
          {offlineMs != null && (
            <span className="ml-auto shrink-0 text-sm whitespace-nowrap text-tertiary">
              Offline for {formatDuration(offlineMs) ?? <NoValue label="Unknown" />}
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
