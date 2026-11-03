import type { ReactNode } from 'react'

import { NavigationContext } from '@/app/context/navigation-context'
import { useHistoryNavigation } from '@/app/hooks/useHistoryNavigation'

/** Shares the app's location and history-backed navigation with every screen. */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigation = useHistoryNavigation()
  return <NavigationContext value={navigation}>{children}</NavigationContext>
}
