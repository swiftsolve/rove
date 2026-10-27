import { useSyncExternalStore } from 'react'
import {
  getLatencySnapshot,
  subscribeLatency,
  type LatencyHistory,
} from '@/features/services/utils/service-latency'

/**
 * The rolling per-host latency history that feeds each service row's sparkline.
 * A read-only subscription to the shared store — the samples are appended once
 * per poll by `useServiceReachability` (see `recordLatency`), so this hook only
 * reads and re-renders on change, with no props to thread through.
 */
export function useServiceLatency(): LatencyHistory {
  return useSyncExternalStore(subscribeLatency, getLatencySnapshot)
}
