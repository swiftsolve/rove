export interface PingStats {
  avgMs: number
  jitterMs: number
  packetLoss: number
}

export interface SpeedResult {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  packetLoss: number
}

export interface Throughput {
  downloadMbps: number
  uploadMbps: number
}

export const SPEED_TEST_PHASES = ['idle', 'internet', 'complete', 'error'] as const

export type SpeedTestPhase = (typeof SPEED_TEST_PHASES)[number]

export interface SpeedTestProgress {
  phase: SpeedTestPhase
  message: string
  /** Progress percentage from 0 to 100. */
  progress: number
}

export type ProgressReporter = (progress: SpeedTestProgress) => void

export const FAILED_PING = {
  avgMs: 999,
  jitterMs: 999,
  packetLoss: 100,
} as const satisfies PingStats
