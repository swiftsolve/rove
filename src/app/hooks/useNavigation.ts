import { useContext } from 'react'
import type { Navigation } from '@/app/utils/location'
import { NavigationContext } from '@/app/context/navigation-context'

/** Where the app is (`location`) and how to move: `navigate(to)` and `back()`. */
export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext)
  if (!navigation) throw new Error('useNavigation must be used inside <NavigationProvider>')
  return navigation
}
