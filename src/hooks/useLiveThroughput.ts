import { useEffect, useSyncExternalStore } from 'react'
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
let idleTracker: IdleTracker = { isIdle: true, lowSince: null }
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
  const history = appendThroughputHistory(
    storeState.history,
    throughput.downloadMbps,
    throughput.uploadMbps,
  )
  idleTracker = nextIdleState(
    throughput.downloadMbps,
    throughput.uploadMbps,
    idleTracker,
    throughput.timestamp,
  )
  setStoreState({ throughput, history, isIdle: idleTracker.isIdle })
}

// The window went out of view long enough to actually pause the feed. Drop the
// stale trace so that when the window comes back the chart refills live from
// "now" instead of resuming a snapshot from minutes ago. (This never fires on a
// tab switch — the window stays visible then, so the feed keeps running.)
function resetHistory(): void {
  idleTracker = { isIdle: true, lowSince: null }
  setStoreState(INITIAL_STATE)
}

// Backend subscribe/unsubscribe are a global on/off with no ref-count of their
// own. A brief hidden blip (or React 18 StrictMode's mount/unmount/remount)
// must not toggle them, so the teardown is deferred and cancelled if the owner
// re-activates within the grace window.
const SUBSCRIPTION_GRACE_MS = 2_000
let sourceActive = false
let detachEvents: (() => void) | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null

function startSource(): void {
  if (stopTimer !== null) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  if (sourceActive) return
  const api = window.networkAPI
  if (!api?.subscribeLiveThroughput) return
  sourceActive = true
  detachEvents = api.onLiveThroughput(ingestSample)
  void api.subscribeLiveThroughput()
}

function stopSourceNow(): void {
  if (!sourceActive) return
  sourceActive = false
  detachEvents?.()
  detachEvents = null
  void window.networkAPI?.unsubscribeLiveThroughput?.()
  resetHistory()
}

function scheduleStopSource(): void {
  if (stopTimer !== null) clearTimeout(stopTimer)
  stopTimer = setTimeout(() => {
    stopTimer = null
    stopSourceNow()
  }, SUBSCRIPTION_GRACE_MS)
}

/**
 * Owns the shared live-throughput subscription. Mount once, high in the tree,
 * passing `active` = window visible. The feed then runs continuously across tab
 * switches (the window stays visible) and only pauses when the window is
 * genuinely hidden (minimised / occluded), matching the polling hooks.
 */
export function useLiveThroughputSource(active: boolean): void {
  useEffect(() => {
    if (!active) {
      scheduleStopSource()
      return
    }
    startSource()
  }, [active])
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
    if (stopTimer !== null) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
    stopSourceNow()
    listeners.clear()
  })
}
