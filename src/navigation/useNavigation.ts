import { useCallback, useEffect, useRef, useState } from 'react'
import type { CapabilityId } from '@/types'
import type { AppTab } from '@/navigation/tabs'

/** A subpage layered over the Speed tab. `null` means the tab's main page. */
export type SpeedSub =
  | { readonly view: 'details'; readonly target: CapabilityId | null }
  | { readonly view: 'history' }

/** A single screen the app can show — a tab, optionally with a subpage. */
export interface AppLocation {
  readonly tab: AppTab
  readonly speedSub: SpeedSub | null
}

export const HOME_LOCATION: AppLocation = { tab: 'home', speedSub: null }

/** A short, stable key for a location — handy for keying effects (e.g. scroll). */
export function locationKey(location: AppLocation): string {
  return `${location.tab}:${location.speedSub?.view ?? ''}`
}

function sameLocation(a: AppLocation, b: AppLocation): boolean {
  if (a.tab !== b.tab) return false
  const subA = a.speedSub
  const subB = b.speedSub
  if (subA == null || subB == null) return subA === subB
  if (subA.view !== subB.view) return false
  return subA.view === 'details' && subB.view === 'details'
    ? subA.target === subB.target
    : true
}

export interface Navigation {
  readonly location: AppLocation
  /** Push a new screen onto the history stack. */
  readonly navigate: (to: AppLocation) => void
  /** Return to the previous screen (same as the browser/OS back button). */
  readonly back: () => void
}

// We stash the location on `history.state` under a namespaced key rather than
// owning the whole state object, so we don't clobber anything the webview host
// might keep there.
const STATE_KEY = '__roveNav'

function readLocation(state: unknown): AppLocation | null {
  if (state != null && typeof state === 'object' && STATE_KEY in state) {
    return (state as Record<string, AppLocation>)[STATE_KEY] ?? null
  }
  return null
}

function writeState(location: AppLocation): Record<string, unknown> {
  const current = window.history.state as Record<string, unknown> | null
  return { ...current, [STATE_KEY]: location }
}

/**
 * Navigation backed by the real browser/webview history stack, so the app's
 * own back buttons and the OS/mouse back gesture all pop the same stack.
 *
 * Each `navigate` pushes a history entry carrying its destination; each history
 * entry therefore *is* a screen. Pressing back fires `popstate` with the
 * previous entry's location, which we mirror into React state.
 */
export function useNavigation(): Navigation {
  const [location, setLocation] = useState<AppLocation>(HOME_LOCATION)
  // Mirror `location` in a ref so `navigate` can compare against the current
  // screen without a stale closure — and, crucially, without doing the
  // pushState side effect inside a setState updater (StrictMode invokes those
  // twice in dev, which would push two entries and make Back need two presses).
  const locationRef = useRef<AppLocation>(HOME_LOCATION)

  const applyLocation = useCallback((next: AppLocation): void => {
    locationRef.current = next
    setLocation(next)
  }, [])

  // Seed the first history entry with our location (via replaceState, so we
  // don't grow the stack), or adopt one a reload left behind. Runs once.
  useEffect(() => {
    const existing = readLocation(window.history.state)
    if (existing) {
      applyLocation(existing)
    } else {
      window.history.replaceState(writeState(HOME_LOCATION), '')
    }
  }, [applyLocation])

  // Mirror back/forward — the app's back buttons, the mouse thumb button, and
  // Alt+←/→ all arrive here.
  useEffect(() => {
    const onPop = (event: PopStateEvent): void => {
      applyLocation(readLocation(event.state) ?? HOME_LOCATION)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyLocation])

  const navigate = useCallback((to: AppLocation): void => {
    // Ignore navigations that don't change the screen, so the back stack never
    // fills with duplicate entries (e.g. tapping the already-active tab).
    if (sameLocation(locationRef.current, to)) return
    window.history.pushState(writeState(to), '')
    applyLocation(to)
  }, [applyLocation])

  const back = useCallback((): void => {
    window.history.back()
  }, [])

  return { location, navigate, back }
}
