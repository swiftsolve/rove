import { useEffect, useSyncExternalStore } from 'react'

import {
  appendThroughputHistory,
  EMPTY_THROUGHPUT_HISTORY,
  type ThroughputHistory,
} from '@/features/live-throughput/utils/throughput-history'
import type { LiveThroughput } from '@/types'
import { sanitizeRate } from '@/types'

export type LiveThroughputState = {
  /** The latest sample. */
  throughput: LiveThroughput
  /** The chart's minute of samples and the few it reaches back to, oldest first. */
  history: ThroughputHistory
}

const INITIAL_STATE: LiveThroughputState = {
  throughput: { downloadMbps: 0, uploadMbps: 0, timestamp: 0 },
  history: EMPTY_THROUGHPUT_HISTORY,
}

/**
 * One module-level store with a single owner (`useLiveThroughputSource`), so the
 * history keeps sampling while another tab is open and a view swap never toggles
 * the backend subscription, which raced two IPC calls and could stick the feed.
 */
let storeState: LiveThroughputState = INITIAL_STATE
const listeners = new Set<() => void>()

function setStoreState(next: LiveThroughputState): void {
  storeState = next
  for (const listener of listeners) listener()
}

function ingestSample(sample: LiveThroughput): void {
  const throughput = {
    downloadMbps: sanitizeRate(sample.downloadMbps),
    uploadMbps: sanitizeRate(sample.uploadMbps),
    timestamp: sample.timestamp || Date.now(),
  }
  const history = appendThroughputHistory(storeState.history, throughput.downloadMbps, throughput.uploadMbps)
  setStoreState({ throughput, history })
}

/**
 * Once the feed has paused, drop the stale trace so the chart refills from now
 * instead of resuming minutes-old data.
 */
function resetHistory(): void {
  setStoreState(INITIAL_STATE)
}

/**
 * The backend subscription is a global switch with no ref-count, so a brief
 * hidden blip or StrictMode's remount must not toggle it: teardown waits this long.
 */
const SUBSCRIPTION_GRACE_MS = 2_000
let isSourceActive = false
let detachEvents: (() => void) | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null

function cancelScheduledStop(): void {
  if (stopTimer === null) return
  clearTimeout(stopTimer)
  stopTimer = null
}

function startSource(): void {
  cancelScheduledStop()
  if (isSourceActive) return
  const api = window.networkAPI
  if (!api?.subscribeLiveThroughput) return
  isSourceActive = true
  detachEvents = api.onLiveThroughput(ingestSample)
  void api.subscribeLiveThroughput()
}

function stopSourceNow(): void {
  if (!isSourceActive) return
  isSourceActive = false
  detachEvents?.()
  detachEvents = null
  void window.networkAPI?.unsubscribeLiveThroughput()
  resetHistory()
}

function scheduleStopSource(): void {
  cancelScheduledStop()
  stopTimer = setTimeout(() => {
    stopTimer = null
    stopSourceNow()
  }, SUBSCRIPTION_GRACE_MS)
}

/**
 * Owns the shared live-throughput subscription. Mount once, high in the tree,
 * with `isActive` set to window visibility, so the feed runs across tab switches
 * and pauses only while the window is hidden.
 */
export function useLiveThroughputSource(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) {
      scheduleStopSource()
      return
    }
    startSource()
  }, [isActive])
}

function subscribeStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Read the shared live-throughput state. Does not own the subscription. */
export function useLiveThroughput(): LiveThroughputState {
  return useSyncExternalStore(subscribeStore, () => storeState)
}

/** Current live-throughput state, for non-React module-level consumers. */
export function getLiveThroughput(): LiveThroughputState {
  return storeState
}

/** Subscribe to live-throughput changes outside React. Returns an unsubscribe. */
export function subscribeLiveThroughput(listener: () => void): () => void {
  return subscribeStore(listener)
}

// Vite HMR re-evaluates this module but keeps the previous bundle's Tauri
// listeners, so release them here. The backend subscription stays on: the
// new module subscribes again, and an unsubscribe sent now could land after
// that and leave the feed off, as the grace period above guards against.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelScheduledStop()
    detachEvents?.()
    detachEvents = null
    isSourceActive = false
    listeners.clear()
  })
}
