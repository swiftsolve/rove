import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { SpeakableText } from '@/app/components/SpeakableText'
import {
  EVENT_TITLES,
  eventSubject,
  initialScanTitle,
  INTERNET_SUBTITLES,
  subjectKind,
  subjectParts,
} from '@/features/events/utils/event-copy'
import { EventHeading } from '@/features/timeline/components/EventHeading'
import type { NetworkEvent, NetworkEventType } from '@/types'
import {
  AlertIcon,
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
  TimelineNode,
  type TimelineNodeColor,
  Tooltip,
  WifiIcon,
} from '@/ui'
import { formatDuration, formatMac } from '@/utils/format'

// The icon says what happened; the tint says how to read it.
const TONE_COLORS = {
  /** Recoveries & connections: this computer's link or internet came up. */
  join: 'var(--status-positive)',
  /**
   * A device appeared, new or back again: worth a look, but neither good nor
   * bad (devices come and go all day), so the accent rather than a status colour.
   */
  arrival: 'var(--accent-default)',
  /**
   * A departure: quiet, not alarming; a known device just dropped off. The
   * hollow ring reads as "gone", set apart from the filled markers.
   */
  leave: 'neutral',
  /** The baseline snapshot. */
  baseline: 'var(--accent-default)',
  /** Cautionary: a new access point appeared, or the gateway changed (warning severity). */
  alert: 'var(--status-warning)',
  /** Alarming: this computer's connection or internet dropped. */
  danger: 'var(--status-negative)',
} as const satisfies Record<string, TimelineNodeColor>

type EventTone = keyof typeof TONE_COLORS

const SUBJECT_LINE = 'type-caption text-secondary'

const ADDRESS_LINE = 'type-caption text-tertiary tabular-nums'

type EventStyle = {
  icon: IconComponent
  tone: EventTone
}

const EVENT_STYLES: Record<NetworkEventType, EventStyle> = {
  initial_scan: { icon: SearchIcon, tone: 'baseline' },
  device_joined: { icon: ArrowRightIcon, tone: 'arrival' },
  ap_appeared: { icon: RouterIcon, tone: 'alert' },
  device_offline: { icon: ArrowLeftIcon, tone: 'leave' },
  device_online: { icon: RefreshIcon, tone: 'arrival' },
  gateway_changed: { icon: AlertIcon, tone: 'alert' },
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
  const internetSubtitle = INTERNET_SUBTITLES[event.type]
  const title = isInitial ? initialScanTitle(event) : EVENT_TITLES[event.type]
  const subject = eventSubject(event)
  const kindLabel = isInitial || !subject ? null : subjectKind(event, subject)
  const metaItems = addressItems(event)

  return (
    <TimelineNode icon={<EventIcon type={event.type} />} color={TONE_COLORS[EVENT_STYLES[event.type].tone]}>
      <EventHeading title={title} ts={event.ts} />
      {subject && (
        <div className={SUBJECT_LINE}>
          <InlineMeta
            items={[
              ...subjectParts(subject),
              kindLabel && (
                <span className="text-tertiary">
                  <SpeakableText text={kindLabel} />
                </span>
              ),
            ]}
          />
        </div>
      )}
      {internetSubtitle && (
        <span className={cx(SUBJECT_LINE, 'flex w-full flex-wrap')}>
          {internetSubtitle}
          {offlineMs != null && (
            <span className="type-caption ml-auto shrink-0 leading-[inherit] whitespace-nowrap text-tertiary">
              Offline for {formatDuration(offlineMs) ?? <NoValue label="Unknown" />}
            </span>
          )}
        </span>
      )}

      {metaItems.length > 0 && (
        <div className={ADDRESS_LINE}>
          <InlineMeta items={metaItems} />
        </div>
      )}
    </TimelineNode>
  )
}
