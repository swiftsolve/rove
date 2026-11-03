import { useCallback, useEffect, useRef, useState } from 'react'

import { type AppLocation, HOME_LOCATION, isSameLocation, type Navigation, parentLocation } from '@/app/utils/location'
import { captureReturnPoint, type ReturnPoint, trackClicks } from '@/app/utils/return-point'

// We stash the location on `history.state` under a namespaced key rather than
// owning the whole state object, so we don't clobber anything the webview host
// might keep there.
const STATE_KEY = '__roveNav'
// The screen's return point, saved on its entry as we leave it for another.
const RETURN_KEY = '__roveReturn'

function readLocation(state: unknown): AppLocation | null {
  if (state == null || typeof state !== 'object' || !(STATE_KEY in state)) return null
  return (state as Record<string, AppLocation>)[STATE_KEY] ?? null
}

function readReturnPoint(state: unknown): ReturnPoint | null {
  if (state == null || typeof state !== 'object' || !(RETURN_KEY in state)) return null
  return (state as Record<string, ReturnPoint>)[RETURN_KEY] ?? null
}

// A new entry starts with no return point: the current entry's is its own.
function historyStateFor(location: AppLocation): Record<string, unknown> {
  const { [RETURN_KEY]: _returnPoint, ...current } = (window.history.state as Record<string, unknown> | null) ?? {}
  return { ...current, [STATE_KEY]: location }
}

/** Saves the screen being left's return point on its own entry. */
function saveReturnPoint(): void {
  const current = (window.history.state as Record<string, unknown> | null) ?? {}
  window.history.replaceState({ ...current, [RETURN_KEY]: captureReturnPoint() }, '')
}

/**
 * Navigation backed by the real browser/webview history stack, so the app's
 * own back buttons and the OS/mouse back gesture all pop the same stack.
 *
 * Each `navigate` pushes a history entry carrying its destination; each history
 * entry therefore *is* a screen. Pressing back fires `popstate` with the
 * previous entry's location, which we mirror into React state.
 */
export function useHistoryNavigation(): Navigation {
  // Adopt the location a reload left in history, or start at home.
  const [location, setLocation] = useState<AppLocation>(() => readLocation(window.history.state) ?? HOME_LOCATION)
  // Mirror `location` in a ref so `navigate` can compare against the current
  // screen without a stale closure — and, crucially, without doing the
  // pushState side effect inside a setState updater (StrictMode invokes those
  // twice in dev, which would push two entries and make Back need two presses).
  const locationRef = useRef<AppLocation>(location)
  // Set only when going back (or forward) onto an entry that saved one.
  const [returnPoint, setReturnPoint] = useState<ReturnPoint | null>(null)
  // How many of *our* entries sit behind the active one — i.e. how many times we
  // can call `history.back()` and stay inside the app. `navigate` pushes one on
  // (increment); popping one off via back/forward (popstate) takes one back. It
  // starts at 0 and never counts entries the host page left behind us, so Back
  // can tell "there's an app screen to return to" from "stepping back would leave
  // the app" — the latter is where the web/mobile demo used to escape to the
  // previous page (or do nothing at the very first entry).
  const appDepthRef = useRef(0)

  const applyLocation = useCallback((next: AppLocation, nextReturnPoint: ReturnPoint | null = null): void => {
    locationRef.current = next
    setLocation(next)
    setReturnPoint(nextReturnPoint)
  }, [])

  // Seed the first history entry with our location (via replaceState, so we
  // don't grow the stack) unless a reload already left one. Runs once.
  useEffect(() => {
    if (!readLocation(window.history.state)) {
      window.history.replaceState(historyStateFor(HOME_LOCATION), '')
    }
  }, [])

  // The opener of the next screen is read from the click that opens it.
  useEffect(() => trackClicks(), [])

  // Mirror back/forward — the app's back buttons, the mouse thumb button, and
  // Alt+←/→ all arrive here.
  useEffect(() => {
    const onPop = (event: PopStateEvent): void => {
      // One of our entries just came off the top (back button, OS gesture,
      // thumb button, Alt+←). Under-counting here is harmless — Back would just
      // fall back to the in-app parent — whereas over-counting could escape, so
      // never drop below zero.
      appDepthRef.current = Math.max(0, appDepthRef.current - 1)
      applyLocation(readLocation(event.state) ?? HOME_LOCATION, readReturnPoint(event.state))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyLocation])

  const navigate = useCallback(
    (to: AppLocation): void => {
      // Ignore navigations that don't change the screen, so the back stack never
      // fills with duplicate entries (e.g. tapping the already-active tab).
      if (isSameLocation(locationRef.current, to)) return
      saveReturnPoint()
      window.history.pushState(historyStateFor(to), '')
      appDepthRef.current += 1
      applyLocation(to)
    },
    [applyLocation],
  )

  const back = useCallback((): void => {
    // If one of our own entries is behind us, pop it — this keeps the app's Back
    // button, the OS back gesture and the history stack in lockstep (the
    // `popstate` handler mirrors the previous screen). If nothing of ours is
    // behind us, `history.back()` would leave the app entirely (or do nothing at
    // the first entry), so instead navigate in-app to the current screen's
    // parent and rewrite the current entry to match.
    if (appDepthRef.current > 0) {
      window.history.back()
      return
    }
    const parent = parentLocation(locationRef.current)
    if (isSameLocation(locationRef.current, parent)) return
    window.history.replaceState(historyStateFor(parent), '')
    applyLocation(parent)
  }, [applyLocation])

  return { location, returnPoint, navigate, back }
}
