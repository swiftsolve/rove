import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'
import { formatCount } from '@/lib/format'
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

// Stand in for the subject row, since internet events have no device.
export const INTERNET_SUBTITLES: Partial<Record<NetworkEventType, string>> = {
  internet_lost: 'No internet connection detected.',
  internet_restored: 'Connection restored.',
}

// How long each `internet_restored` (by id) followed the loss it ended. Walks
// oldest-first, tracking the last unmatched loss.
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

// The category beside the name, unless the name already says it (an unnamed
// "Android phone" shouldn't add "Phone").
export function subjectKind(event: NetworkEvent, subject: string): string | null {
  if (!event.kind || event.kind === 'unknown') return null
  const label = LAN_DEVICE_KIND_LABELS[event.kind]
  const lead = (label.split(' ')[0] ?? label).toLowerCase()
  if (subject.toLowerCase().includes(lead)) return null
  return label
}

// The baseline row carries its device count in `newValue`.
export function initialScanTitle(event: NetworkEvent): string {
  const count = Number(event.newValue ?? 0)
  return `${formatCount(count, 'device')} discovered`
}

// About this machine's WAN reachability, not a device, so these get a fixed
// subtitle instead of a subject (which would read "Unknown device").
export function isInternetEvent(event: NetworkEvent): boolean {
  return event.type === 'internet_lost' || event.type === 'internet_restored'
}

// The device, a fixed line for the network-wide baseline, none for internet events.
export function eventSubject(event: NetworkEvent): string | null {
  if (event.type === 'initial_scan') return 'Tracking changes from here on'
  if (isInternetEvent(event)) return null
  return subjectName(event)
}

// An event the UI has copy for. Others (a row left by a retired feature) are
// filtered out rather than shown as a placeholder.
export function isKnownEvent(event: NetworkEvent): boolean {
  return event.type in EVENT_TITLES
}
