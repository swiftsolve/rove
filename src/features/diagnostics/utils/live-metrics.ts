import type { LiveDiagnostics, NetworkDiagnostics } from '@/types'

type Reading<T> = {
  data: T | null
  /** When it landed, in ms since the epoch; 0 before it has. */
  updatedAt: number
}

/**
 * The full snapshot with the live latency and internet verdict on top, when
 * the live reading is the newer one. A cached live reading from an earlier
 * visit must not sit over the snapshot that just refetched. A newer live null
 * ping means unreachable, so it wins over the snapshot's value.
 */
export function overlayLiveMetrics(
  snapshot: Reading<NetworkDiagnostics>,
  live: Reading<LiveDiagnostics>,
): NetworkDiagnostics | null {
  if (snapshot.data == null) return null
  if (live.data == null || live.updatedAt <= snapshot.updatedAt) return snapshot.data
  return { ...snapshot.data, gatewayPing: live.data.gatewayPing, internet: live.data.internet }
}
