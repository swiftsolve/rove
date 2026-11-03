export type PingStats = {
  avgMs: number
  jitterMs: number
  packetLoss: number
}

export type SpeedResult = {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  packetLoss: number
}

export type Throughput = {
  downloadMbps: number
  uploadMbps: number
}

export const SPEED_TEST_PHASES = ['idle', 'internet', 'complete', 'error'] as const

export type SpeedTestPhase = (typeof SPEED_TEST_PHASES)[number]

export type SpeedTestProgress = {
  phase: SpeedTestPhase
  message: string
  /** Progress percentage from 0 to 100. */
  progress: number
}

export const FAILED_PING = {
  avgMs: 999,
  jitterMs: 999,
  packetLoss: 100,
} as const satisfies PingStats

/** A real round trip: not the FAILED_PING sentinel, and a number. */
export function isMeasuredLatency(ms: number): boolean {
  return Number.isFinite(ms) && ms < FAILED_PING.avgMs
}
