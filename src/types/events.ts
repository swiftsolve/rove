import type { LanDeviceKind } from './devices'

/** Slugs the backend stamps on each event; the UI switches on these for copy
 *  and iconography. Kept in sync with the `EVENT_*` constants in
 *  crates/rove-core/src/store.rs. */
export const NETWORK_EVENT_TYPES = [
  'initial_scan',
  'device_joined',
  'ap_appeared',
  'device_offline',
  'device_online',
  'gateway_changed',
  'wifi_connected',
  'ethernet_connected',
] as const

export type NetworkEventType = (typeof NETWORK_EVENT_TYPES)[number]

/** Visual weight of an event row. */
export type NetworkEventSeverity = 'info' | 'warning' | 'critical'

/**
 * One entry in the network-change feed, derived by the backend from diffing
 * successive device scans (see Store::record_devices). Append-only and pruned
 * to a 7-day window.
 */
export interface NetworkEvent {
  readonly id: number
  /** Epoch milliseconds. */
  readonly ts: number
  readonly type: NetworkEventType
  readonly severity: NetworkEventSeverity
  readonly mac: string | null
  readonly ip: string | null
  /** Best-effort device label captured when the event fired. */
  readonly name: string | null
  /** Device category (the same kind the Devices view shows), read live from the
   *  current roster for device-subject events. Null when unknown or the event
   *  isn't about a single device (an SSID, a count, a gateway change). */
  readonly kind: LanDeviceKind | null
  /** Change events only: the value before and after (e.g. old/new IP). */
  readonly oldValue: string | null
  readonly newValue: string | null
  /** The device's MAC was privacy-randomized — presence events for it are
   *  noisier (a phone re-randomizes ~daily), so the UI flags them. */
  readonly randomized: boolean
}
