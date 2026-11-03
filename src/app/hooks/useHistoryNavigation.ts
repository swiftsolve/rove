import { useCallback, useEffect, useRef, useState } from 'react'

import { type AppLocation, HOME_LOCATION, isSameLocation, type Navigation, parentLocation } from '@/app/utils/location'
import { captureReturnPoint, type ReturnPoint, trackClicks } from '@/app/utils/return-point'

// Namespaced, so we don't clobber anything the webview host keeps on `history.state`.
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
 * Navigation on the real history stack, one entry per screen, so the app's back
 * buttons and the OS/mouse back gesture all pop the same stack.
 */
export function useHistoryNavigation(): Navigation {
  const [location, setLocation] = useState<AppLocation>(() => readLocation(window.history.state) ?? HOME_LOCATION)
  // A ref, so `navigate` never pushes from inside a setState updater: StrictMode
  // runs those twice, pushing two entries.
  const locationRef = useRef<AppLocation>(location)
  // Set only when going back (or forward) onto an entry that saved one.
  const [returnPoint, setReturnPoint] = useState<ReturnPoint | null>(null)
  // How many of our own entries sit behind the active one. Entries the host page
  // left are never counted, so Back can't step out of the app (the web demo).
  const appDepthRef = useRef(0)

  const applyLocation = useCallback((next: AppLocation, nextReturnPoint: ReturnPoint | null = null): void => {
    locationRef.current = next
    setLocation(next)
    setReturnPoint(nextReturnPoint)
  }, [])

  useEffect(() => {
    if (!readLocation(window.history.state)) {
      window.history.replaceState(historyStateFor(HOME_LOCATION), '')
    }
  }, [])

  // The opener of the next screen is read from the click that opens it.
  useEffect(() => trackClicks(), [])

  // The app's back buttons, the mouse thumb button and Alt+←/→ all arrive here.
  useEffect(() => {
    const onPop = (event: PopStateEvent): void => {
      // Under-counting only falls back to the in-app parent; over-counting
      // could leave the app, so never drop below zero.
      appDepthRef.current = Math.max(0, appDepthRef.current - 1)
      applyLocation(readLocation(event.state) ?? HOME_LOCATION, readReturnPoint(event.state))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyLocation])

  const navigate = useCallback(
    (to: AppLocation): void => {
      // E.g. tapping the active tab: no duplicate entry on the back stack.
      if (isSameLocation(locationRef.current, to)) return
      saveReturnPoint()
      window.history.pushState(historyStateFor(to), '')
      appDepthRef.current += 1
      applyLocation(to)
    },
    [applyLocation],
  )

  const back = useCallback((): void => {
    // With nothing of ours behind us, `history.back()` would leave the app (or
    // do nothing), so go to the parent screen in place instead.
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
