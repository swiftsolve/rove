import { useCallback, useSyncExternalStore } from 'react'

/**
 * A shared wall clock for text that ages ("3 min ago"), so render stays pure:
 * `Date.now()` in render would freeze once anything memoises it. One interval
 * serves every subscriber, and pauses while the window is hidden (see
 * `usePageVisible`).
 */

/** How often the clock re-reads: the finest resolution `useNow` can serve. */
const TICK_MS = 1_000

let current = Date.now()
let timer: number | null = null
const listeners = new Set<() => void>()

function tick(): void {
  current = Date.now()
  for (const notify of listeners) notify()
}

function start(): void {
  if (timer != null || document.hidden) return
  // `current` may be minutes stale. React re-reads the snapshot after
  // subscribing, so this needs no notify.
  current = Date.now()
  timer = window.setInterval(tick, TICK_MS)
}

function stop(): void {
  if (timer == null) return
  window.clearInterval(timer)
  timer = null
}

function onVisibilityChange(): void {
  if (document.hidden) {
    stop()
    return
  }
  start()
  // No tick ran while hidden, so announce the jump now.
  tick()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    start()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }
}

/**
 * The current time, floored to `resolutionMs` so a caller re-renders only when
 * its bucket turns over. It trails real time by up to `resolutionMs`, so ask for
 * just finer than the smallest unit you render.
 */
export function useNow(resolutionMs: number = TICK_MS): number {
  const getSnapshot = useCallback(() => Math.floor(current / resolutionMs) * resolutionMs, [resolutionMs])
  return useSyncExternalStore(subscribe, getSnapshot)
}
