import { useCallback, useSyncExternalStore } from 'react'

/**
 * A shared wall clock for text that ages ("3 min ago"), so render stays pure:
 * `Date.now()` in render would freeze once anything memoises it. One interval
 * serves every subscriber, and pauses while the window is hidden (see
 * `usePageVisible`).
 */

/** How often the clock re-reads: the finest resolution `useNow` can serve. */
const TICK_MS = 1_000

let currentTimeMs = Date.now()
let tickIntervalId: number | null = null
const listeners = new Set<() => void>()

function tick(): void {
  currentTimeMs = Date.now()
  for (const notify of listeners) notify()
}

function startTicking(): void {
  if (tickIntervalId != null || document.hidden) return
  // `currentTimeMs` may be minutes stale. React re-reads the snapshot after
  // subscribing, so this needs no notify.
  currentTimeMs = Date.now()
  tickIntervalId = window.setInterval(tick, TICK_MS)
}

function stopTicking(): void {
  if (tickIntervalId == null) return
  window.clearInterval(tickIntervalId)
  tickIntervalId = null
}

function onVisibilityChange(): void {
  if (document.hidden) {
    stopTicking()
    return
  }
  startTicking()
  // No tick ran while hidden, so announce the jump now.
  tick()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    startTicking()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stopTicking()
    }
  }
}

/**
 * The current time, floored to `resolutionMs` so a caller re-renders only when
 * its bucket turns over. It trails real time by up to `resolutionMs`, so ask for
 * just finer than the smallest unit you render.
 */
export function useNow(resolutionMs: number = TICK_MS): number {
  const getSnapshot = useCallback(() => Math.floor(currentTimeMs / resolutionMs) * resolutionMs, [resolutionMs])
  return useSyncExternalStore(subscribe, getSnapshot)
}
