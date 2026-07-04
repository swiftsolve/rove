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

export function useLiveThroughput(enabled: boolean): LiveThroughputState {
  const [state, setState] = useState<LiveThroughputState>(INITIAL_STATE)
  const idleRef = useRef<IdleTracker>({ isIdle: true, lowSince: null })

  useEffect(() => {
    if (!enabled || !window.networkAPI?.subscribeLiveThroughput) return

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

        return { throughput, history, isIdle: idle.isIdle }
      })
    }

    const unsubscribeEvents = window.networkAPI.onLiveThroughput(handleUpdate)
    void window.networkAPI.subscribeLiveThroughput()

    return () => {
      unsubscribeEvents()
      void window.networkAPI.unsubscribeLiveThroughput()
      idleRef.current = { isIdle: true, lowSince: null }
      setState(INITIAL_STATE)
    }
  }, [enabled])

  return state
}
