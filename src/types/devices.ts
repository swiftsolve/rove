export const LAN_DEVICE_KINDS = [
  'router',
  'nas',
  'computer',
  'tablet',
  'phone',
  'console',
  'tv',
  'printer',
  'camera',
  'speaker',
  'iot',
  'unknown',
] as const

/** Best-effort device category inferred from vendor OUI and role flags. */
export type LanDeviceKind = (typeof LAN_DEVICE_KINDS)[number]

export const LAN_DEVICE_KIND_LABELS: Readonly<Record<LanDeviceKind, string>> = {
  router: 'Network',
  nas: 'NAS / Server',
  computer: 'Computer',
  tablet: 'Tablet',
  phone: 'Mobile',
  console: 'Game console',
  tv: 'TV / Media',
  printer: 'Printer',
  camera: 'Camera',
  speaker: 'Speaker',
  iot: 'Smart home',
  unknown: 'Unknown',
}

/** A single host discovered on the local network segment. */
export interface LanDevice {
  /** Best-effort category — vendor OUIs only reveal so much. */
  readonly kind: LanDeviceKind
  readonly ip: string
  readonly mac: string
  /** Best-effort vendor from the MAC OUI, or null when unknown/randomized. */
  readonly vendor: string | null
  /** Reverse-DNS/mDNS hostname (suffix trimmed), or null when unresolvable. */
  readonly hostname: string | null
  /** Hardware model from mDNS/UPnP (e.g. "MacBookPro18,3"), or null. */
  readonly model: string | null
  /** True when the MAC is locally administered (privacy-randomized). */
  readonly isRandomizedMac: boolean
  /** This device is the default gateway (router). */
  readonly isGateway: boolean
  /** This device is the machine Beacon is running on. */
  readonly isSelf: boolean
  /** Neighbor entry is currently reachable (vs. merely cached/stale). */
  readonly reachable: boolean
}

export interface LanDeviceScan {
  readonly devices: readonly LanDevice[]
  /** CIDR of the scanned segment, e.g. "192.168.2.0/24". */
  readonly subnet: string | null
  readonly interfaceName: string | null
  readonly scannedAt: number
}

export function createEmptyDeviceScan(): LanDeviceScan {
  return { devices: [], subnet: null, interfaceName: null, scannedAt: 0 }
}
