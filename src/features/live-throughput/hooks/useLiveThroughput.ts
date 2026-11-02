import { useEffect, useSyncExternalStore } from 'react'
import type { LiveThroughput } from '@/types'
import { EMPTY_LIVE_THROUGHPUT, sanitizeRate } from '@/types'
import {
  appendThroughputHistory,
  EMPTY_THROUGHPUT_HISTORY,
  type ThroughputHistory,
} from '@/features/live-throughput/utils/throughput-history'

export interface LiveThroughputState {
  /** The latest sample. */
  throughput: LiveThroughput
  /** The last minute of samples, oldest first. */
  history: ThroughputHistory
}

const INITIAL_STATE: LiveThroughputState = {
  throughput: EMPTY_LIVE_THROUGHPUT,
  history: EMPTY_THROUGHPUT_HISTORY,
}

/**
 * The live feed is a single module-level store, not per-component state. One
 * owner (mounted high in the tree via `useLiveThroughputSource`) holds the
 * backend subscription and folds each 1 Hz sample into a rolling 60 s history;
 * views just read the store. Keeping one owner means the history is sampled
 * continuously — including while you're on another tab — so the chart is already
 * current when you return to Home instead of showing a frozen snapshot from when
 * you left. It also means the backend subscription is never toggled off-and-on
 * during a view swap, which previously raced two ordering-independent IPC calls
 * and could leave the feed stuck.
 */
let storeState: LiveThroughputState = INITIAL_STATE
const listeners = new Set<() => void>()

function setStoreState(next: LiveThroughputState): void {
  storeState = next
  for (const listener of listeners) listener()
}

function ingestSample(update: LiveThroughput): void {
  const throughput = {
    downloadMbps: sanitizeRate(update.downloadMbps),
    uploadMbps: sanitizeRate(update.uploadMbps),
    timestamp: update.timestamp || Date.now(),
  }
  const history = appendThroughputHistory(storeState.history, throughput.downloadMbps, throughput.uploadMbps)
  setStoreState({ throughput, history })
}

// The window went out of view long enough to actually pause the feed. Drop the
// stale trace so that when the window comes back the chart refills live from
// "now" instead of resuming a snapshot from minutes ago. (This never fires on a
// tab switch — the window stays visible then, so the feed keeps running.)
function resetHistory(): void {
  setStoreState(INITIAL_STATE)
}

// Backend subscribe/unsubscribe are a global on/off with no ref-count of their
// own. A brief hidden blip (or React 18 StrictMode's mount/unmount/remount)
// must not toggle them, so the teardown is deferred and cancelled if the owner
// re-activates within the grace window.
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
  void window.networkAPI?.unsubscribeLiveThroughput?.()
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
 * passing `isActive` = window visible. The feed then runs continuously across tab
 * switches (the window stays visible) and only pauses when the window is
 * genuinely hidden (minimised / occluded), matching the polling hooks.
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

// Vite HMR re-evaluates this module without tearing down the Rust backend or the
// Tauri event listeners registered by the previous bundle — release them here so
// the next bundle's owner starts from a clean slate.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelScheduledStop()
    stopSourceNow()
    listeners.clear()
  })
}
