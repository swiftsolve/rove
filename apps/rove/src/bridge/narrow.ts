import {
  LAN_DEVICE_KINDS,
  type LanDeviceKind,
  type LanDeviceScan,
  NETWORK_EVENT_TYPES,
  type NetworkEvent,
  type NetworkEventType,
} from '@/types'

// The Rust side can ship a new device kind or event type before the UI knows
// it. Narrowed here, at the boundary, a lookup keyed by one can't come back
// undefined and crash the screen (the events persist, so it would crash on
// every open).

const DEVICE_KINDS = new Set<string>(LAN_DEVICE_KINDS)
const EVENT_TYPES = new Set<string>(NETWORK_EVENT_TYPES)

function isKnownDeviceKind(kind: string): kind is LanDeviceKind {
  return DEVICE_KINDS.has(kind)
}

/** The scan with any device kind the UI doesn't know read as `unknown`. */
export function narrowDeviceScan(scan: LanDeviceScan): LanDeviceScan {
  if (scan.devices.every((device) => isKnownDeviceKind(device.kind))) return scan
  return {
    ...scan,
    devices: scan.devices.map((device) => (isKnownDeviceKind(device.kind) ? device : { ...device, kind: 'unknown' })),
  }
}

/** The events the UI knows how to show, any other type dropped and an unknown device kind read as `unknown`. */
export function knownEvents(events: NetworkEvent[]): NetworkEvent[] {
  const isKnownType = (type: string): type is NetworkEventType => EVENT_TYPES.has(type)
  return events
    .filter((event) => isKnownType(event.type))
    .map((event) => (event.kind == null || isKnownDeviceKind(event.kind) ? event : { ...event, kind: 'unknown' }))
}
