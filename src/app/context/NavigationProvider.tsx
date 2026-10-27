import type { ReactNode } from 'react'
import { NavigationContext } from '@/app/context/navigation-context'
import { useHistoryNavigation } from '@/app/hooks/useHistoryNavigation'

/** Shares the app's location and history-backed navigation with every screen. */
export function NavigationProvider({ children }: { children: ReactNode }): JSX.Element {
  const navigation = useHistoryNavigation()
  return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>
}
