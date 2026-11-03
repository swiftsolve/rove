import { use } from 'react'
import type { Theme } from '@/app/hooks/useThemeState'
import { ThemeContext } from '@/app/context/theme-context'

/** The colour theme: `mode` (dark / light / system), `isLight`, `setMode` and `toggle`. */
export function useTheme(): Theme {
  const theme = use(ThemeContext)
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>')
  return theme
}
