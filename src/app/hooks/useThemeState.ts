import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

import {
  isResolvedLight,
  LEGACY_SETTING,
  LIGHT_QUERY,
  MODE_SETTING,
  systemPrefersLight,
  type ThemeMode,
  themeModeFrom,
} from '@/app/utils/theme-mode'
import { applyThemeClass, swapResolvedTheme } from '@/app/utils/theme-transition'
import { useSetting } from '@/hooks/useSetting'

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

  // So a 'system' choice follows the desktop live.
  useEffect(() => {
    const lightQuery = window.matchMedia(LIGHT_QUERY)
    const onChange = (): void => setIsSystemLight(lightQuery.matches)
    lightQuery.addEventListener('change', onChange)
    return () => lightQuery.removeEventListener('change', onChange)
  }, [])

  const isLight = isResolvedLight(mode, isSystemLight)

  // Also covers changes that skip the animated setMode path: an OS flip while
  // on 'system', or another window's choice. Before paint, so no frame shows
  // the other theme.
  useLayoutEffect(() => {
    applyThemeClass(isLight)
  }, [isLight])

  const setMode = useCallback(
    (nextMode: ThemeMode): void => {
      swapResolvedTheme(isResolvedLight(nextMode, systemPrefersLight()), () => setStoredMode(nextMode))
    },
    [setStoredMode],
  )

  // An explicit choice, so it also moves the user off 'system'.
  const toggle = useCallback((): void => setMode(isLight ? 'dark' : 'light'), [setMode, isLight])

  return { mode, isLight, setMode, toggle }
}
