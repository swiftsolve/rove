import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'
import type { LanDevice, LanDeviceKind } from '@/types'

// Nouns for synthesizing a name. The category labels in LAN_DEVICE_KIND_LABELS
// ("Mobile") don't read naturally after an OS ("Android Mobile").
const KIND_NOUNS: Record<Exclude<LanDeviceKind, 'unknown'>, string> = {
  router: 'router',
  nas: 'NAS',
  computer: 'computer',
  tablet: 'tablet',
  phone: 'phone',
  watch: 'watch',
  console: 'game console',
  tv: 'TV',
  printer: 'printer',
  camera: 'camera',
  speaker: 'speaker',
  iot: 'smart home device',
}

const MINUTE_MS = 60_000

// An offline device seen this recently is still in the ARP table but not
// answering, so its age is suppressed (see lastSeenAge).
const RECENTLY_SEEN_MS = 90_000

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function kindNoun(device: LanDevice): string | null {
  return device.kind !== 'unknown' ? KIND_NOUNS[device.kind] : null
}

// A privacy-randomized phone often has no vendor or hostname, but the scan may
// still know its OS or kind (DHCP fingerprint), so name it from those.
function describeUnnamed(device: LanDevice): string {
  const noun = kindNoun(device)
  if (device.os && noun) return `${device.os} ${noun}`
  if (device.os) return `${device.os} device`
  if (noun) return capitalize(noun)
  return 'Generic device'
}

/** The name's parts, shown with a dot separator between them (Apple, Phone). */
export function deviceName(device: LanDevice): string[] {
  if (device.isGateway) return ['Router']
  if (device.isSelf) return ['This device']
  // A hostname is the name the user gave the device, so it always wins.
  if (device.hostname) return [device.hostname]
  if (!device.vendor) return [describeUnnamed(device)]
  // The kind chip already says "Smart home", so the verbose noun would repeat it.
  if (device.kind === 'iot') return [device.vendor]
  const noun = kindNoun(device)
  return noun ? [device.vendor, capitalize(noun)] : [device.vendor]
}

// Coarse ("3m ago", "2h ago", "4d ago"): only offline devices show an age.
export function relativeAge(ms: number): string {
  const mins = Math.floor(ms / MINUTE_MS)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// The age beside an offline badge. Suppressed within RECENTLY_SEEN_MS: a device
// still in the ARP table but not answering would read "Offline, just now".
export function lastSeenAge(device: LanDevice, now: number): string | null {
  if (device.isReachable || device.lastSeen == null) return null
  const ms = now - device.lastSeen
  if (ms < RECENTLY_SEEN_MS) return null
  return relativeAge(ms)
}

// Kind, vendor, OS and model, dropping any part that repeats the name or an
// earlier part (an Apple handheld whose vendor and OS are both "Apple").
export function deviceMetaParts(device: LanDevice, name: string[]): string[] {
  const seen = new Set<string>([name.join(' ').toLowerCase()])
  return [
    device.kind !== 'unknown' ? LAN_DEVICE_KIND_LABELS[device.kind] : undefined,
    device.vendor ?? undefined,
    device.os ?? undefined,
    device.model ?? undefined,
  ].filter((part): part is string => {
    if (!part) return false
    const key = part.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isGenericGatewayName(part: string): boolean {
  return part.toLowerCase() === 'router' || part.toLowerCase() === 'gateway'
}

// The gateway is always named "Router", so surface its product ("Giga Hub 2.0")
// separately: its hostname, else its model, skipping generic names like "router".
export function gatewayProduct(device: LanDevice): string | null {
  return [device.hostname, device.model].find((part) => part && !isGenericGatewayName(part)) ?? null
}

// Online first in scan order (the sort is stable), then offline by last seen.
export function sortDevices(devices: LanDevice[]): LanDevice[] {
  return [...devices].sort((a, b) => {
    if (a.isReachable !== b.isReachable) return a.isReachable ? -1 : 1
    if (!a.isReachable) return (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
    return 0
  })
}
