export interface PingStats {
  readonly avgMs: number
  readonly jitterMs: number
  readonly packetLoss: number
}

export interface SpeedResult {
  readonly downloadMbps: number
  readonly uploadMbps: number
  readonly latencyMs: number
  readonly jitterMs: number
  readonly packetLoss: number
}

export interface Throughput {
  readonly downloadMbps: number
  readonly uploadMbps: number
}

export const SPEED_TEST_PHASES = ['idle', 'internet', 'complete', 'error'] as const

export type SpeedTestPhase = (typeof SPEED_TEST_PHASES)[number]

export interface SpeedTestProgress {
  readonly phase: SpeedTestPhase
  readonly message: string
  /** Progress percentage from 0 to 100. */
  readonly progress: number
}

export type ProgressReporter = (progress: SpeedTestProgress) => void

export const FAILED_PING = {
  avgMs: 999,
  jitterMs: 999,
  packetLoss: 100,
} as const satisfies PingStats
