import type { LanDeviceKind } from './devices'

/**
 * Slugs the backend stamps on each event; the UI switches on these for copy
 * and iconography. Kept in sync with the `EVENT_*` constants in
 * crates/rove-core/src/store/events.rs.
 */
export const NETWORK_EVENT_TYPES = [
  'initial_scan',
  'device_joined',
  'ap_appeared',
  'device_offline',
  'device_online',
  'gateway_changed',
  'wifi_connected',
  'ethernet_connected',
  'connection_lost',
  'internet_lost',
  'internet_restored',
] as const

export type NetworkEventType = (typeof NETWORK_EVENT_TYPES)[number]

/** Visual weight of an event row. */
export type NetworkEventSeverity = 'info' | 'warning' | 'critical'

/**
 * One entry in the network-change feed. The backend diffs successive device
 * scans (`Store::record_devices`), this machine's connection
 * (`record_connection`) and internet verdicts (`record_internet`). Append-only,
 * pruned to 7 days.
 */
export type NetworkEvent = {
  id: number
  /** Epoch milliseconds. */
  ts: number
  type: NetworkEventType
  severity: NetworkEventSeverity
  mac: string | null
  ip: string | null
  /** Best-effort device label captured when the event fired. */
  name: string | null
  /**
   * Device category (the kind the Devices view shows), read live from the
   * current roster for device events. Null when unknown or the event isn't
   * about a single device (an SSID, a count, a gateway change).
   */
  kind: LanDeviceKind | null
  /** Change events only: the value before and after (e.g. old/new IP). */
  oldValue: string | null
  newValue: string | null
  /**
   * The device's MAC was privacy-randomized. Its presence events are noisier
   * (a phone re-randomizes about daily), so the UI flags them.
   */
  isRandomized: boolean
}
