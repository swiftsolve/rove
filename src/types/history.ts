import type { SpeedResult } from './speed'

/** The connection a speed test ran on, captured at record time. */
export type SpeedRunContext = {
  /** A `ConnectionType`, kept as a plain string as the database stores it. */
  connectionType: string
  /** The SSID on Wi-Fi, else null. */
  networkName: string | null
  linkSpeedMbps: number | null
  /** Wi-Fi centre frequency in MHz, for the band label. */
  frequency: number | null
}

/** A past speed-test result as persisted in the local database. */
export type SpeedHistoryEntry = {
  /** Epoch ms. */
  timestamp: number
} & SpeedResult &
  SpeedRunContext
