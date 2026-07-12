import type { JSX, ReactNode } from 'react'
import type { NetworkEvent, NetworkEventType } from '@/types'
import { LAN_DEVICE_KIND_LABELS } from '@/types'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { RefreshIconButton } from '@/components/ui/RefreshIconButton'
import { Spinner } from '@/components/ui/Spinner'
import { ViewHeader } from '@/components/ui/ViewHeader'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EthernetIcon,
  HelpIcon,
  RefreshIcon,
  RouterIcon,
  SearchIcon,
  EventsIcon,
  ShieldAlertIcon,
  WifiIcon,
} from '@/components/ui/Icons'
import './EventsView.css'

const FEED_HINT =
  'Rove logs changes it notices between device scans — new devices and access points, departures, and shifts in a device’s IP, name, vendor or type. Events are kept for 30 days. Scans run on the Devices tab, on Home, or when you refresh here.'

interface EventsViewProps {
  readonly events: readonly NetworkEvent[]
  readonly isLoading: boolean
  /** A scan (which is what produces new events) is in flight. */
  readonly isScanning: boolean
  readonly error: string | null
  /** Kick a fresh scan so any changes since last time surface as events. */
  readonly onRefresh: () => void
}

type IconComponent = (props: { readonly size?: number }) => JSX.Element

// The node's colour category. The glyph says *what* happened; this tint says how
// to read it at a glance — arrivals/connections read positive (green), the
// baseline calm (blue), a departure quiet (grey), a new access point cautionary
// (amber), a gateway change alarming (red). Warning/critical events keep the
// loud colours severity used before.
type EventTone = 'join' | 'leave' | 'baseline' | 'alert' | 'danger'

interface EventStyle {
  readonly icon: IconComponent
  readonly tone: EventTone
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
}

const EVENT_TITLES: Record<NetworkEventType, string> = {
  initial_scan: 'Network baseline', // overridden with the live count below
  device_joined: 'New device joined the network',
  ap_appeared: 'New access point detected',
  device_offline: 'Device dropped off the network',
  device_online: 'Device reconnected',
  gateway_changed: 'Gateway changed',
  wifi_connected: 'Connected to Wi‑Fi',
  ethernet_connected: 'Connected to Ethernet',
}

function subjectName(event: NetworkEvent): string {
  if (event.name) return event.name
  if (event.randomized) return 'Private device'
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

function ordinal(day: number): string {
  const teens = day % 100
  if (teens >= 11 && teens <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

// Absolute date + 12h time, e.g. "12th January, 1:24 PM" — the timeline shows each
// node's own timestamp rather than day-grouping, so the line stays continuous.
function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const month = date.toLocaleDateString(undefined, { month: 'long' })
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${ordinal(date.getDate())} ${month}, ${time}`
}

function EventIcon({ type }: { readonly type: NetworkEventType }): JSX.Element {
  const Icon = EVENT_STYLES[type]?.icon ?? ActivityIcon
  return <Icon size={15} />
}

function TimelineItem({ event }: { readonly event: NetworkEvent }): JSX.Element {
  const isInitial = event.type === 'initial_scan'
  const title = isInitial ? initialScanTitle(event) : EVENT_TITLES[event.type] ?? 'Network change'
  // The baseline keeps a one-line subtitle (it's a network-wide summary, not a
  // device); every other event just shows the device it's about.
  const subject = isInitial ? 'Tracking changes from here on' : subjectName(event)
  const kindLabel = isInitial ? null : subjectKind(event, subject)
  // The baseline carries its count in newValue, which isn't a before→after
  // transition, so don't render it as one.
  const hasChange = !isInitial && event.oldValue != null && event.newValue != null

  // The address line: MAC · Randomized · IP (any absent part is dropped).
  // InlineMeta renders each separator as a dot icon.
  const metaItems: ReactNode[] = []
  if (!isInitial && event.mac) {
    metaItems.push(<span className="num">{event.mac.toUpperCase()}</span>)
    if (event.randomized) {
      metaItems.push(<span title="Privacy-randomized MAC address">Randomized</span>)
    }
  }
  if (!isInitial && event.ip) metaItems.push(<span className="num">{event.ip}</span>)

  return (
    <div className="tl-item">
      <span
        className={`tl-marker tone-${EVENT_STYLES[event.type]?.tone ?? 'baseline'}`}
        aria-hidden
      >
        <EventIcon type={event.type} />
      </span>
      <div className="tl-content">
        <span className="tl-time">{formatTimestamp(event.ts)}</span>
        <span className="tl-title">{title}</span>
        {subject && (
          <InlineMeta
            className="tl-subject"
            items={[subject, kindLabel && <span className="tl-subject-kind">{kindLabel}</span>]}
          />
        )}

        {hasChange && (
          <span className="tl-change">
            <span className="tl-old num">{event.oldValue}</span>
            <span className="tl-arrow" aria-hidden>
              →
            </span>
            <span className="tl-new num">{event.newValue}</span>
          </span>
        )}

        {metaItems.length > 0 && <InlineMeta className="tl-meta" items={metaItems} />}
      </div>
    </div>
  )
}

export default function EventsView({
  events,
  isLoading,
  isScanning,
  error,
  onRefresh,
}: EventsViewProps): JSX.Element {
  const hasEvents = events.length > 0

  return (
    <div className="view-page">
      <ViewHeader
        icon={<EventsIcon size={18} />}
        title="Timeline"
        subtitle={
          hasEvents ? (
            <span className="text-meta">What’s changed in the past 30 days</span>
          ) : undefined
        }
        subtitleShown={hasEvents}
        actions={
          <>
            <Tooltip content={FEED_HINT}>
              <button
                type="button"
                className="btn-icon btn-icon-secondary"
                aria-label="About network events"
              >
                <HelpIcon size={16} />
              </button>
            </Tooltip>
            <RefreshIconButton
              label="Scan for changes"
              isBusy={isScanning}
              onClick={onRefresh}
              busyBehavior="ignore"
            />
          </>
        }
      />

      {error && <div className="error-banner">{error}</div>}

      {isLoading && !hasEvents ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Loading events…</p>
        </div>
      ) : !hasEvents ? (
        <div className="view-empty events-empty">
          <ActivityIcon size={40} className="events-empty-icon" />
          <p className="events-empty-title">No events yet</p>
          <p className="text-muted events-hint">
            Changes on your network — new devices, departures, IP or name changes — show up here as
            Rove scans. Run a scan to check now.
          </p>
          <button type="button" className="btn-secondary" onClick={onRefresh}>
            Scan now
          </button>
        </div>
      ) : (
        <div className="events-timeline">
          {events.map((event) => (
            <TimelineItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
