export const LAN_DEVICE_KINDS = [
  'router',
  'nas',
  'computer',
  'tablet',
  'phone',
  'watch',
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

/** How decisive the classifier's vote was — 'low' kinds render hedged. */
export type LanDeviceKindConfidence = 'high' | 'low'

export const LAN_DEVICE_KIND_LABELS: Readonly<Record<LanDeviceKind, string>> = {
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

/** A single host discovered on the local network segment. */
export interface LanDevice {
  /** Best-effort category — vendor OUIs only reveal so much. */
  readonly kind: LanDeviceKind
  /** 'low' when the kind is a thin-margin guess, rendered hedged ("Phone?"). */
  readonly kindConfidence: LanDeviceKindConfidence
  readonly ip: string
  readonly mac: string
  /** Best-effort vendor from the MAC OUI, or null when unknown/randomized. */
  readonly vendor: string | null
  /** Reverse-DNS/mDNS hostname (suffix trimmed), or null when unresolvable. */
  readonly hostname: string | null
  /** Hardware model from mDNS/UPnP (e.g. "MacBookPro18,3"), or null. */
  readonly model: string | null
  /**
   * OS family from the passive DHCP fingerprint (e.g. "Android", "Windows",
   * "Apple"), or null when unknown.
   */
  readonly os: string | null
  /** True when the MAC is locally administered (privacy-randomized). */
  readonly isRandomizedMac: boolean
  /** This device is the default gateway (router). */
  readonly isGateway: boolean
  /** This device is the machine Rove is running on. */
  readonly isSelf: boolean
  /** Neighbor entry is currently reachable (vs. merely cached/stale). */
  readonly reachable: boolean
  /**
   * Epoch-ms this device last answered. Present so an offline device can show
   * "last seen 3m ago"; null on a device that hasn't been reconciled with the
   * roster. Offline devices are dropped from the list 24h after this.
   */
  readonly lastSeen: number | null
}

/**
 * State of the passive DHCP-fingerprinting listener:
 * - `starting` — bind not yet resolved (first scan of the session)
 * - `active` — listening on :67, fingerprints will accrue as devices join
 * - `unavailable` — no privilege to bind :67 (see the install setcap step)
 */
export type DhcpStatus = 'starting' | 'active' | 'unavailable'

export interface LanDeviceScan {
  readonly devices: readonly LanDevice[]
  /** CIDR of the scanned segment, e.g. "192.168.2.0/24". */
  readonly subnet: string | null
  readonly interfaceName: string | null
  readonly scannedAt: number
  readonly dhcpStatus: DhcpStatus
}

export function createEmptyDeviceScan(): LanDeviceScan {
  return { devices: [], subnet: null, interfaceName: null, scannedAt: 0, dhcpStatus: 'starting' }
}
