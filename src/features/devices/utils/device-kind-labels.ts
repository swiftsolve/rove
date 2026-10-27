import type { LanDeviceKind } from '@/types'

/** How each device kind is named in the UI. */
export const LAN_DEVICE_KIND_LABELS: Record<LanDeviceKind, string> = {
  router: 'Network',
  nas: 'NAS / Server',
  computer: 'Computer',
  tablet: 'Tablet',
  phone: 'Phone',
  watch: 'Watch',
  console: 'Game console',
  tv: 'TV / Media',
  printer: 'Printer',
  camera: 'Camera',
  speaker: 'Speaker',
  iot: 'Smart home',
  unknown: 'Unknown',
}
