import { useSyncExternalStore } from 'react'

import { getLatencySnapshot, type LatencyHistory, subscribeLatency } from '@/features/services/utils/service-latency'

/**
 * The per-host latency history behind each row's sparkline. Read-only:
 * `useServiceReachability` appends to it once per poll (see `recordLatency`).
 */
export function useServiceLatency(): LatencyHistory {
  return useSyncExternalStore(subscribeLatency, getLatencySnapshot)
}
