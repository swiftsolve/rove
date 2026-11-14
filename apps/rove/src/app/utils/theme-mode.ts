import { getSetting } from '@/hooks/useSetting'

/**
 * The colour-theme preference: an explicit choice, or `system` to follow the
 * OS's `prefers-color-scheme`. Stored as a setting, so every window agrees.
 */
export type ThemeMode = 'dark' | 'light' | 'system'

export const THEME_MODE_SETTING = 'themeMode'
export const LEGACY_LIGHT_MODE_SETTING = 'lightMode'
export const PREFERS_LIGHT_QUERY = '(prefers-color-scheme: light)'

/** The stored mode, given the stored text of the mode and the old setting ('' when unset). */
export function themeModeFrom(stored: string, legacy: string): ThemeMode {
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  // Migrate the old boolean-only preference: an explicit lightMode becomes an
  // explicit light/dark choice. Its absence means the user never chose, so a
  // fresh install falls through to the default below.
  if (legacy === 'true') return 'light'
  if (legacy === 'false') return 'dark'
  // Dark matches what index.html declares, so a fresh install paints no other
  // theme first. 'system' is opt-in from Settings.
  return 'dark'
}

export function doesSystemPreferLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PREFERS_LIGHT_QUERY).matches
}

/** Resolve the mode to a concrete light (true) or dark (false). */
export function isResolvedLight(mode: ThemeMode, isSystemLight: boolean): boolean {
  return mode === 'light' || (mode === 'system' && isSystemLight)
}

/** Whether the stored preference resolves to light right now: read before the first render, so it paints in the right theme. */
export function isStoredThemeLight(): boolean {
  const mode = themeModeFrom(getSetting(THEME_MODE_SETTING, ''), getSetting(LEGACY_LIGHT_MODE_SETTING, ''))
  return isResolvedLight(mode, doesSystemPreferLight())
}
