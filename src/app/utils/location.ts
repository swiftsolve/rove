import type { ReturnPoint } from '@/app/utils/return-point'
import type { AppTab } from '@/app/utils/tabs'
import type { CapabilityId } from '@/types'

/** A subpage layered over the Speed tab. `null` means the tab's main page. */
export type SpeedSub = { view: 'details'; target: CapabilityId | null } | { view: 'history' }

/** A subpage layered over the Services tab. `null` means the tab's main page. */
export type ServicesSub = { view: 'timeline' }

/**
 * A subpage layered over the Apps tab. `null` means the tab's main page.
 * `hosts` is the per-app remote-host breakdown, where `app` names the group to
 * open expanded; `traffic` is the by-protocol breakdown.
 */
export type AppsSub = { view: 'hosts'; app?: string | null } | { view: 'traffic' }

/**
 * A single screen the app can show: a tab, optionally with a subpage. Each
 * subpage field only applies to its own tab; omit them all for a tab's main page.
 */
export type AppLocation = {
  tab: AppTab
  speedSub?: SpeedSub | null
  servicesSub?: ServicesSub | null
  appsSub?: AppsSub | null
}

export type Navigation = {
  location: AppLocation
  /**
   * The control to focus on arriving, when the screen was left by opening
   * another from it and is now returned to through history.
   */
  returnPoint: ReturnPoint | null
  /** Push a new screen onto the history stack. */
  navigate: (to: AppLocation) => void
  /** Return to the previous screen (same as the browser/OS back button). */
  back: () => void
}

export const HOME_LOCATION: AppLocation = { tab: 'home' }

/**
 * Where Back goes when there's no app history entry to pop: a subpage to its
 * tab's main page, anything else to Home. Keeps Back from leaving the app.
 */
export function parentLocation(location: AppLocation): AppLocation {
  const isOnSubpage = location.speedSub != null || location.servicesSub != null || location.appsSub != null
  return isOnSubpage ? { tab: location.tab } : HOME_LOCATION
}

/** The focused app of an Apps subpage, or null. Only `hosts` carries one. */
function focusedAppOf(sub: AppsSub | null | undefined): string | null {
  return sub?.view === 'hosts' ? (sub.app ?? null) : null
}

/** A short, stable key for a location, for keying effects and the screen's error boundary. */
export function locationKey(location: AppLocation): string {
  return [
    location.tab,
    location.speedSub?.view ?? '',
    location.servicesSub?.view ?? '',
    location.appsSub?.view ?? '',
    focusedAppOf(location.appsSub) ?? '',
  ].join(':')
}

/** Only the `details` view carries extra state (its target capability). */
function isSameSpeedSub(a: SpeedSub | null | undefined, b: SpeedSub | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null
  if (a.view === 'details' && b.view === 'details') return a.target === b.target
  return a.view === b.view
}

export function isSameLocation(a: AppLocation, b: AppLocation): boolean {
  if (a.tab !== b.tab) return false
  if ((a.servicesSub?.view ?? null) !== (b.servicesSub?.view ?? null)) return false
  if ((a.appsSub?.view ?? null) !== (b.appsSub?.view ?? null)) return false
  if (focusedAppOf(a.appsSub) !== focusedAppOf(b.appsSub)) return false
  return isSameSpeedSub(a.speedSub, b.speedSub)
}
