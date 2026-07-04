import type { SpeedResult } from './speed'
import type { LanDeviceKind } from './devices'

/** The connection a speed test ran on, captured at record time. */
export interface SpeedRunContext {
  readonly connectionType: string // 'wifi' | 'ethernet' | 'unknown'
  readonly networkName: string | null // SSID for Wi-Fi, else null
}

/** A past speed-test result as persisted in the local database. */
export interface SpeedHistoryEntry extends SpeedResult, SpeedRunContext {
  readonly timestamp: number // epoch ms
}

/** A LAN device remembered across scans, with first/last-seen timestamps. */
export interface KnownDevice {
  readonly mac: string
  readonly ip: string | null
  readonly hostname: string | null
  readonly vendor: string | null
  readonly kind: LanDeviceKind
  readonly firstSeen: number // epoch ms
  readonly lastSeen: number // epoch ms
}
