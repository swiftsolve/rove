import { useCallback, useEffect, useState } from 'react'
import { swapResolvedTheme } from '@/app/utils/theme-transition'

/**
 * The colour-theme preference: an explicit choice, or `system` to follow the
 * OS's `prefers-color-scheme`. Persisted to localStorage so it survives reloads
 * and stays in sync across surfaces reading the same key. With nothing stored
 * the app starts dark; `system` is opt-in from Settings.
 *
 * The rest of the app only cares about the resolved light/dark boolean; this
 * hook derives it from the mode and, when `system`, from the live OS setting.
 * The circular-reveal animation the swap plays lives in theme-transition.ts.
 */
export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'rove.setting.themeMode'
const LEGACY_STORAGE_KEY = 'rove.setting.lightMode'
const LIGHT_QUERY = '(prefers-color-scheme: light)'

function readMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
    // Migrate the old boolean-only preference: an explicit lightMode becomes an
    // explicit light/dark choice. Its absence means the user never chose, so a
    // fresh install falls through to the default below.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy === 'true') return 'light'
    if (legacy === 'false') return 'dark'
  } catch {
    // localStorage unavailable (private mode) — fall through to the default.
  }
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

export interface Theme {
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
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [isSystemLight, setIsSystemLight] = useState<boolean>(systemPrefersLight)

  // Track the OS preference so a 'system' choice reflects it live (e.g. the user
  // flips their desktop to light while the app is open).
  useEffect(() => {
    const lightQuery = window.matchMedia(LIGHT_QUERY)
    const onChange = (): void => setIsSystemLight(lightQuery.matches)
    lightQuery.addEventListener('change', onChange)
    return () => lightQuery.removeEventListener('change', onChange)
  }, [])

  // Adopt cross-surface changes to the same key so two open windows agree.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY) setModeState(readMode())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const isLight = isResolvedLight(mode, isSystemLight)

  // Mirror the resolved theme onto the document element as a class so index.css
  // can remap its design tokens. Covers passive changes too (an OS flip while on
  // 'system'), which arrive here without going through the animated setMode path.
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', isLight)
  }, [isLight])

  const setMode = useCallback((nextMode: ThemeMode): void => {
    const isNextLight = isResolvedLight(nextMode, systemPrefersLight())

    const persist = (): void => {
      setModeState(nextMode)
      try {
        window.localStorage.setItem(STORAGE_KEY, nextMode)
      } catch {
        // Persisting is best-effort; the in-memory value still updates.
      }
    }

    swapResolvedTheme(isNextLight, persist)
  }, [])

  // The nav-rail toggle makes an explicit choice — the opposite of what's showing
  // now — which also moves the user off 'system' if they were on it.
  const toggle = useCallback((): void => {
    setMode(document.documentElement.classList.contains('theme-light') ? 'dark' : 'light')
  }, [setMode])

  return { mode, isLight, setMode, toggle }
}
