import { useCallback, useSyncExternalStore } from 'react'

/**
 * The wall clock, as something render can read without lying.
 *
 * Text that ages — "3 min ago", "Down for 12 min" — needs the current time, but
 * calling `Date.now()` during render makes render impure: the same props give a
 * different answer every call, so nothing may cache the result, and the day a
 * memoising layer does, the label silently freezes at whatever it first said.
 * Here the read happens in a store instead; render only ever reads back a
 * number that was captured outside it.
 *
 * One interval serves the whole app — started by the first subscriber, stopped
 * with the last — rather than one per component showing a timestamp. It pauses
 * while the window is hidden and catches up on return, for the reason
 * `usePageVisible` spells out: a timer frozen in the background otherwise fires
 * the instant the app comes back.
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
  // `current` may be stale by minutes — from module load, or from the last time
  // every subscriber went away. Refresh before the first tick lands; React
  // re-reads the snapshot after subscribing, so this needs no notify of its own.
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
  // No interval ran while we were away, so nothing has told anyone that the
  // clock jumped. Say so now, or every age on screen stays as stale as the
  // moment the window was hidden.
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
 * The current time, floored to `resolutionMs`.
 *
 * The floor is what keeps re-renders proportional to what a caller actually
 * shows: a "3 min ago" label asking for 10s re-renders when that bucket turns
 * over, not on every tick of the shared clock. The cost is that the value
 * trails real time by up to `resolutionMs` — so ask for a resolution finer than
 * the smallest unit you render, and no finer.
 */
export function useNow(resolutionMs: number = TICK_MS): number {
  const getSnapshot = useCallback(
    () => Math.floor(current / resolutionMs) * resolutionMs,
    [resolutionMs],
  )
  return useSyncExternalStore(subscribe, getSnapshot)
}
