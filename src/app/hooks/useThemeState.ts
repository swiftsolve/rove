import { useCallback, useEffect, useState } from 'react'

import { applyThemeClass, swapResolvedTheme } from '@/app/utils/theme-transition'
import { useSetting } from '@/hooks/useSetting'

/**
 * The colour-theme preference: an explicit choice, or `system` to follow the
 * OS's `prefers-color-scheme`. A setting like any other (`useSetting`), so it
 * survives reloads and every window agrees on it. With nothing stored the app
 * starts dark; `system` is opt-in from Settings.
 *
 * The rest of the app only cares about the resolved light/dark boolean; this
 * hook derives it from the mode and, when `system`, from the live OS setting.
 * The circular-reveal animation the swap plays lives in theme-transition.ts.
 */
export type ThemeMode = 'dark' | 'light' | 'system'

const MODE_SETTING = 'themeMode'
const LEGACY_SETTING = 'lightMode'
const LIGHT_QUERY = '(prefers-color-scheme: light)'

/** The stored mode, given the stored text of the mode and the old setting ('' when unset). */
function themeModeFrom(stored: string, legacy: string): ThemeMode {
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  // Migrate the old boolean-only preference: an explicit lightMode becomes an
  // explicit light/dark choice. Its absence means the user never chose, so a
  // fresh install falls through to the default below.
  if (legacy === 'true') return 'light'
  if (legacy === 'false') return 'dark'
  // Dark is the app's own look: it's what index.html declares (color-scheme,
  // theme-color) and what the first paint shows, so starting there means no
  // flash and no surprise for someone on a light desktop. 'system' remains a
  // choice in Settings, just not the one we make for you.
  return 'dark'
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(LIGHT_QUERY).matches
}

/** Resolve the mode to a concrete light(true)/dark(false) boolean. */
function isResolvedLight(mode: ThemeMode, isSystemLight: boolean): boolean {
  return mode === 'light' || (mode === 'system' && isSystemLight)
}

export type Theme = {
  /** The user's stored preference: 'dark' | 'light' | 'system'. */
  mode: ThemeMode
  /** The resolved theme currently on screen. */
  isLight: boolean
  /** Set an explicit preference (or 'system') with an animated swap + sound. */
  setMode: (mode: ThemeMode) => void
  /** Nav-rail toggle: flip to the explicit opposite of what's showing. */
  toggle: () => void
}

export function useThemeState(): Theme {
  const [storedMode, setStoredMode] = useSetting(MODE_SETTING, '')
  const [legacyMode] = useSetting(LEGACY_SETTING, '')
  const mode = themeModeFrom(storedMode, legacyMode)
  const [isSystemLight, setIsSystemLight] = useState<boolean>(systemPrefersLight)

  // Track the OS preference so a 'system' choice reflects it live (e.g. the user
  // flips their desktop to light while the app is open).
  useEffect(() => {
    const lightQuery = window.matchMedia(LIGHT_QUERY)
    const onChange = (): void => setIsSystemLight(lightQuery.matches)
    lightQuery.addEventListener('change', onChange)
    return () => lightQuery.removeEventListener('change', onChange)
  }, [])

  const isLight = isResolvedLight(mode, isSystemLight)

  // Mirror the resolved theme onto the document element as a class so the design
  // tokens switch to their Light values. Covers passive changes too (an OS flip while on
  // 'system', or another window's choice), which arrive here without going
  // through the animated setMode path.
  useEffect(() => {
    applyThemeClass(isLight)
  }, [isLight])

  const setMode = useCallback(
    (nextMode: ThemeMode): void => {
      swapResolvedTheme(isResolvedLight(nextMode, systemPrefersLight()), () => setStoredMode(nextMode))
    },
    [setStoredMode],
  )

  // The nav-rail toggle makes an explicit choice — the opposite of what's showing
  // now — which also moves the user off 'system' if they were on it.
  const toggle = useCallback((): void => setMode(isLight ? 'dark' : 'light'), [setMode, isLight])

  return { mode, isLight, setMode, toggle }
}
