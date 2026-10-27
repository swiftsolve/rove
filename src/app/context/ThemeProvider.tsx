import type { ReactNode } from 'react'
import { ThemeContext } from '@/app/context/theme-context'
import { useThemeState } from '@/app/hooks/useThemeState'

/** Shares the colour theme: the nav rail toggles it and Settings picks the mode. */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const theme = useThemeState()
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
