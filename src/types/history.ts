import type { SpeedResult } from './speed'

/** The connection a speed test ran on, captured at record time. */
export type SpeedRunContext = {
  connectionType: string // 'wifi' | 'ethernet' | 'unknown'
  networkName: string | null // SSID for Wi-Fi, else null
  linkSpeedMbps: number | null
  frequency: number | null // Wi-Fi centre frequency (MHz), for band label
}

/** A past speed-test result as persisted in the local database. */
export type SpeedHistoryEntry = {
  timestamp: number // epoch ms
} & SpeedResult &
  SpeedRunContext
