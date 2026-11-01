import type { LanDevice, LanDeviceKind } from '@/types'
import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'

// Singular device nouns for synthesizing a name — distinct from the category
// labels in LAN_DEVICE_KIND_LABELS ("Mobile", "Smart home"), which don't read
// naturally after an OS ("Android Mobile"). "unknown" has no noun by design.
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

// A privacy-randomized phone often has no OUI vendor and no hostname, yet the
// scan still identifies its OS/kind (e.g. via the DHCP fingerprint). Rather than
// fall straight to "Generic device", name it from whatever we did learn:
// "Android phone", "Android device", or just "Phone".
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
  // A real hostname is the name the user gave the device — it always wins.
  if (device.hostname) return [device.hostname]
  // Keep the kind beside a known maker rather than letting the vendor replace
  // it, so the kind never drops out of the name. A vendor is a brand, so it
  // reads as maker, then type (Apple, Phone), matching the dot-separated meta
  // line; when the maker is unknown, fall back to the OS/kind synthesis.
  if (!device.vendor) return [describeUnnamed(device)]
  // A smart-home device's noun ("smart home device") is verbose and already
  // spelled out in the kind chip below the name ("Smart home"), so pairing it
  // with the maker reads as Espressif, Smart home device. Show the maker
  // alone there — the chip carries the category.
  if (device.kind === 'iot') return [device.vendor]
  const noun = kindNoun(device)
  return noun ? [device.vendor, capitalize(noun)] : [device.vendor]
}

// A coarse "3m ago" / "2h ago" / "4d ago". We only ever show this for offline
// devices, so second-level precision isn't worth it.
export function relativeAge(ms: number): string {
  const mins = Math.floor(ms / MINUTE_MS)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// A bare "12m ago" for an offline device, shown inline in the meta line. The
// "Offline" badge already carries the meaning, so the age needs no "Last seen"
// prefix. Suppressed when it was seen within RECENTLY_SEEN_MS — that's a device
// still in the ARP table but not answering, where "just now" would only read as
// a contradiction. A device merged back from the roster carries an older
// timestamp and gets the age.
export function lastSeenAge(device: LanDevice, now: number): string | null {
  if (device.isReachable || device.lastSeen == null) return null
  const ms = now - device.lastSeen
  if (ms < RECENTLY_SEEN_MS) return null
  return relativeAge(ms)
}

// Kind, vendor, OS and model, dropping unknown parts. Vendor comes from the
// MAC OUI (or an inferred maker like Apple); OS from the passive DHCP
// fingerprint. Case-insensitively drop any part that just repeats the name
// (e.g. a nameless host shown as its vendor) or an earlier part (an Apple
// handheld whose vendor and OS are both "Apple").
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

// The gateway's name is the generic role "Router", so the product we resolved
// (e.g. "Giga Hub 2.0") would otherwise never surface. Prefer the UPnP
// friendlyName (the gateway's hostname, which the display name discards),
// falling back to the hardware model — but skip a generic reverse-DNS hostname
// like "router" so the real model wins instead.
export function gatewayProduct(device: LanDevice): string | null {
  return [device.hostname, device.model].find((part) => part && !isGenericGatewayName(part)) ?? null
}

// Online first (keeping the scan's order among them), then offline devices
// most-recently-seen first. A stable sort preserves the live ordering within
// each group.
export function sortDevices(devices: LanDevice[]): LanDevice[] {
  return [...devices].sort((a, b) => {
    if (a.isReachable !== b.isReachable) return a.isReachable ? -1 : 1
    if (!a.isReachable) return (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
    return 0
  })
}
