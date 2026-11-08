import { useCallback, useEffect, useRef, useState } from 'react'

import { type HistoryStep, historyStepForButton, historyStepForKey } from '@/app/utils/history-shortcuts'
import {
  type AppLocation,
  HOME_LOCATION,
  isAppLocation,
  isSameLocation,
  type Navigation,
  parentLocation,
} from '@/app/utils/location'
import { captureReturnPoint, isReturnPoint, type ReturnPoint, trackClicks } from '@/app/utils/return-point'
import { isTauri } from '@/bridge/tauri-network-api'
import { IS_MAC } from '@/utils/platform'

// Namespaced, so we don't clobber anything the webview host keeps on `history.state`.
const LOCATION_KEY = '__roveNav'
// The screen's return point, saved on its entry as we leave it for another.
const RETURN_KEY = '__roveReturn'
// How many of our own entries sit behind this one. Kept on the entry, not
// counted on each pop, so a forward step or a reload can't throw it off.
const DEPTH_KEY = '__roveDepth'

/** One of our fields on a history entry's state, or undefined on an entry we didn't write. */
function readField(state: unknown, key: string): unknown {
  if (state == null || typeof state !== 'object') return undefined
  return (state as Record<string, unknown>)[key]
}

function readLocation(state: unknown): AppLocation | null {
  const location = readField(state, LOCATION_KEY)
  return isAppLocation(location) ? location : null
}

function readDepth(state: unknown): number {
  const depth = readField(state, DEPTH_KEY)
  return typeof depth === 'number' ? depth : 0
}

function readReturnPoint(state: unknown): ReturnPoint | null {
  const returnPoint = readField(state, RETURN_KEY)
  return isReturnPoint(returnPoint) ? returnPoint : null
}

// A new entry starts with no return point: the current entry's is its own.
function historyStateFor(location: AppLocation): Record<string, unknown> {
  const { [RETURN_KEY]: _returnPoint, ...current } = (window.history.state as Record<string, unknown> | null) ?? {}
  return { ...current, [LOCATION_KEY]: location }
}

/** True when focus is in a field where the arrow keys move a caret. */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') != null
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

  // Every history step arrives here: the app's back buttons, and a browser's or
  // the desktop app's back and forward shortcuts (below).
  useEffect(() => {
    const onPop = (event: PopStateEvent): void => {
      applyLocation(readLocation(event.state) ?? HOME_LOCATION, readReturnPoint(event.state))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyLocation])

  const navigate = useCallback(
    (to: AppLocation): void => {
      // E.g. tapping the active tab: no duplicate entry on the back stack.
      if (isSameLocation(locationRef.current, to)) return
      const depth = readDepth(window.history.state)
      saveReturnPoint()
      window.history.pushState({ ...historyStateFor(to), [DEPTH_KEY]: depth + 1 }, '')
      applyLocation(to)
    },
    [applyLocation],
  )

  const back = useCallback((): void => {
    // With nothing of ours behind us, `history.back()` would leave the app (or
    // do nothing), so go to the parent screen in place instead. Entries the host
    // page left (the web demo) carry no depth, so Back never steps out to them.
    if (readDepth(window.history.state) > 0) {
      window.history.back()
      return
    }
    const parent = parentLocation(locationRef.current)
    if (isSameLocation(locationRef.current, parent)) return
    window.history.replaceState(historyStateFor(parent), '')
    applyLocation(parent)
  }, [applyLocation])

  // A browser maps Alt+←/→ (⌘[ ⌘] on macOS) and the mouse's thumb buttons to
  // history steps itself; Tauri's webviews don't, so the desktop app does.
  useEffect(() => {
    if (!isTauri()) return
    const takeHistoryStep = (step: HistoryStep): void => (step === 'back' ? back() : window.history.forward())
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      const historyStep = historyStepForKey(event, { isMac: IS_MAC, isEditing: isTextField(event.target) })
      if (!historyStep) return
      event.preventDefault()
      takeHistoryStep(historyStep)
    }
    const onMouseUp = (event: MouseEvent): void => {
      const historyStep = historyStepForButton(event.button)
      if (!historyStep) return
      event.preventDefault()
      takeHistoryStep(historyStep)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [back])

  return { location, returnPoint, navigate, back }
}
