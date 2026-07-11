import { useCallback, useEffect, useState } from 'react'
import { swapResolvedTheme } from '@/lib/theme-transition'

/**
 * The colour-theme preference: an explicit choice, or `system` to follow the
 * OS's `prefers-color-scheme`. Persisted to localStorage so it survives reloads
 * and stays in sync across surfaces reading the same key.
 *
 * The rest of the app only cares about the resolved light/dark boolean; this
 * hook derives it from the mode and, when `system`, from the live OS setting.
 * The circular-reveal animation the swap plays lives in lib/theme-transition.ts.
 */
export type ThemeMode = 'dark' | 'light' | 'system'

const KEY = 'rove.setting.themeMode'
const LEGACY_KEY = 'rove.setting.lightMode'
const LIGHT_QUERY = '(prefers-color-scheme: light)'

function readMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
    // Migrate the old boolean-only preference: an explicit lightMode becomes an
    // explicit light/dark choice. Its absence means the user never chose, so a
    // fresh install follows the OS.
    const legacy = window.localStorage.getItem(LEGACY_KEY)
    if (legacy === 'true') return 'light'
    if (legacy === 'false') return 'dark'
  } catch {
    // localStorage unavailable (private mode) — fall through to the default.
  }
  return 'system'
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(LIGHT_QUERY).matches
}

/** Resolve the mode to a concrete light(true)/dark(false) boolean. */
function resolveLight(mode: ThemeMode, sysLight: boolean): boolean {
  return mode === 'light' || (mode === 'system' && sysLight)
}

export interface Theme {
  /** The user's stored preference: 'dark' | 'light' | 'system'. */
  readonly mode: ThemeMode
  /** The resolved theme currently on screen. */
  readonly light: boolean
  /** Set an explicit preference (or 'system') with an animated swap + sound. */
  readonly setMode: (mode: ThemeMode) => void
  /** Nav-rail toggle: flip to the explicit opposite of what's showing. */
  readonly toggle: () => void
}

export function useTheme(): Theme {
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [sysLight, setSysLight] = useState<boolean>(systemPrefersLight)

  // Track the OS preference so a 'system' choice reflects it live (e.g. the user
  // flips their desktop to light while the app is open).
  useEffect(() => {
    const mq = window.matchMedia(LIGHT_QUERY)
    const onChange = (): void => setSysLight(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Adopt cross-surface changes to the same key so two open windows agree.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === KEY) setModeState(readMode())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const light = resolveLight(mode, sysLight)

  // Mirror the resolved theme onto the document element as a class so index.css
  // can remap its design tokens. Covers passive changes too (an OS flip while on
  // 'system'), which arrive here without going through the animated setMode path.
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', light)
  }, [light])

  const setMode = useCallback((nextMode: ThemeMode): void => {
    const nextLight = resolveLight(nextMode, systemPrefersLight())

    const persist = (): void => {
      setModeState(nextMode)
      try {
        window.localStorage.setItem(KEY, nextMode)
      } catch {
        // Persisting is best-effort; the in-memory value still updates.
      }
    }

    swapResolvedTheme(nextLight, persist)
  }, [])

  // The nav-rail toggle makes an explicit choice — the opposite of what's showing
  // now — which also moves the user off 'system' if they were on it.
  const toggle = useCallback((): void => {
    setMode(document.documentElement.classList.contains('theme-light') ? 'dark' : 'light')
  }, [setMode])

  return { mode, light, setMode, toggle }
}
