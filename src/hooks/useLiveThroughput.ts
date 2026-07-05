import { useEffect, useRef, useState } from 'react'
import type { LiveThroughput } from '@/types'
import { EMPTY_LIVE_THROUGHPUT, sanitizeRate } from '@/types'
import {
  appendThroughputHistory,
  EMPTY_THROUGHPUT_HISTORY,
  type ThroughputHistory,
} from '@/components/traffic/throughput-history'

/** Hysteresis keeps the idle badge from flickering on background noise. */
const IDLE_ENTER_MBPS = 0.08
const IDLE_EXIT_MBPS = 0.15
const IDLE_ENTER_MS = 3_000

interface IdleTracker {
  readonly isIdle: boolean
  readonly lowSince: number | null
}

function nextIdleState(
  downloadMbps: number,
  uploadMbps: number,
  tracker: IdleTracker,
  now: number,
): IdleTracker {
  const peak = Math.max(downloadMbps, uploadMbps)

  if (tracker.isIdle) {
    if (peak >= IDLE_EXIT_MBPS) {
      return { isIdle: false, lowSince: null }
    }
    return tracker
  }

  if (downloadMbps < IDLE_ENTER_MBPS && uploadMbps < IDLE_ENTER_MBPS) {
    const lowSince = tracker.lowSince ?? now
    if (now - lowSince >= IDLE_ENTER_MS) {
      return { isIdle: true, lowSince }
    }
    return { isIdle: false, lowSince }
  }

  return { isIdle: false, lowSince: null }
}

/**
 * Shared, reference-counted backend subscription. `subscribeLiveThroughput` /
 * `unsubscribeLiveThroughput` are global backend commands with no ref-count of
 * their own, so N consumers (or React 18 StrictMode's mount/unmount/remount)
 * must not each toggle it — the first attach subscribes, the last detach
 * unsubscribes. Because the backend tracks a subscriber *count*, the net of
 * subscribe/unsubscribe calls is order-independent.
 */
let backendRefCount = 0

function attachThroughput(
  api: NonNullable<Window['networkAPI']>,
  onUpdate: (t: LiveThroughput) => void,
): () => void {
  const detachEvents = api.onLiveThroughput(onUpdate)
  backendRefCount += 1
  if (backendRefCount === 1) {
    void api.subscribeLiveThroughput()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    detachEvents()
    backendRefCount -= 1
    if (backendRefCount === 0) {
      void api.unsubscribeLiveThroughput()
    }
  }
}

export interface LiveThroughputState {
  readonly throughput: LiveThroughput
  readonly history: ThroughputHistory
  readonly isIdle: boolean
}

const INITIAL_STATE: LiveThroughputState = {
  throughput: EMPTY_LIVE_THROUGHPUT,
  history: EMPTY_THROUGHPUT_HISTORY,
  isIdle: true,
}

/**
 * Persisted at module scope so the live chart keeps its accumulated history when
 * Home unmounts on a tab switch and remounts on return — otherwise the graph
 * would blank out and slowly refill from empty each time you come back.
 */
let cachedState: LiveThroughputState = INITIAL_STATE
let cachedIdle: IdleTracker = { isIdle: true, lowSince: null }

export function useLiveThroughput(enabled: boolean): LiveThroughputState {
  const [state, setState] = useState<LiveThroughputState>(() => cachedState)
  const idleRef = useRef<IdleTracker>(cachedIdle)

  useEffect(() => {
    const api = window.networkAPI
    if (!enabled || !api?.subscribeLiveThroughput) return

    const handleUpdate = (update: LiveThroughput): void => {
      const throughput = {
        downloadMbps: sanitizeRate(update.downloadMbps),
        uploadMbps: sanitizeRate(update.uploadMbps),
        timestamp: update.timestamp || Date.now(),
      }

      setState((current) => {
        const history = appendThroughputHistory(
          current.history,
          throughput.downloadMbps,
          throughput.uploadMbps,
        )

        const idle = nextIdleState(
          throughput.downloadMbps,
          throughput.uploadMbps,
          idleRef.current,
          throughput.timestamp,
        )
        idleRef.current = idle
        cachedIdle = idle

        const next = { throughput, history, isIdle: idle.isIdle }
        cachedState = next
        return next
      })
    }

    const detach = attachThroughput(api, handleUpdate)

    // Keep the accumulated history in the module cache on unmount so navigating
    // away and back doesn't blank the chart.
    return detach
  }, [enabled])

  return state
}
