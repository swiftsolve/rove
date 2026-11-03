import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'
import type { NetworkEvent, NetworkEventType } from '@/types'

export const EVENT_TITLES: Record<NetworkEventType, string> = {
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
export const INTERNET_SUBTITLES: Partial<Record<NetworkEventType, string>> = {
  internet_lost: 'No internet connection detected.',
  internet_restored: 'Connection restored.',
}

// Pair each `internet_restored` with the `internet_lost` it ended (keyed by the
// restored event's id) so the recovery row can show how long we were offline —
// the same "Offline for …" the services timeline shows. Events arrive
// newest-first, so we walk oldest-first tracking the last unmatched loss.
export function offlineDurations(newestFirst: NetworkEvent[]): Map<number, number> {
  const durations = new Map<number, number>()
  let lostTs: number | null = null
  for (const e of [...newestFirst].reverse()) {
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
export function subjectKind(event: NetworkEvent, subject: string): string | null {
  if (!event.kind || event.kind === 'unknown') return null
  const label = LAN_DEVICE_KIND_LABELS[event.kind]
  const lead = (label.split(' ')[0] ?? label).toLowerCase()
  if (subject.toLowerCase().includes(lead)) return null
  return label
}

// The baseline row's headline is built from the device count it carries in
// `newValue`, rather than a fixed string.
export function initialScanTitle(event: NetworkEvent): string {
  const count = Number(event.newValue ?? 0)
  return `${count} ${count === 1 ? 'device' : 'devices'} discovered`
}

// Internet up/down events describe this machine's own WAN reachability, not a
// device — they carry a fixed descriptive subtitle instead of a device subject
// or address line (subjectName would otherwise read "Unknown device").
export function isInternetEvent(event: NetworkEvent): boolean {
  return event.type === 'internet_lost' || event.type === 'internet_restored'
}

// The subject line under the title. The baseline keeps a one-line subtitle (it's
// a network-wide summary, not a device); internet events have none; every other
// event just shows the device it's about.
export function eventSubject(event: NetworkEvent): string | null {
  if (event.type === 'initial_scan') return 'Tracking changes from here on'
  if (isInternetEvent(event)) return null
  return subjectName(event)
}

// An event the UI has copy for. Anything else — e.g. a row left behind by a
// retired feature — is filtered out upstream rather than shown as a placeholder,
// so `TimelineItem` only ever renders a recognized type.
export function isKnownEvent(event: NetworkEvent): boolean {
  return event.type in EVENT_TITLES
}
