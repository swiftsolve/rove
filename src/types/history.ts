import type { SpeedResult } from './speed'

/** The connection a speed test ran on, captured at record time. */
export interface SpeedRunContext {
  connectionType: string // 'wifi' | 'ethernet' | 'unknown'
  networkName: string | null // SSID for Wi-Fi, else null
  linkSpeedMbps: number | null
  frequency: number | null // Wi-Fi centre frequency (MHz), for band label
}

/** A past speed-test result as persisted in the local database. */
export interface SpeedHistoryEntry extends SpeedResult, SpeedRunContext {
  timestamp: number // epoch ms
}
