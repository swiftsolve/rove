import { use } from 'react'

import { NavigationContext } from '@/app/context/navigation-context'
import type { Navigation } from '@/app/utils/location'

/** Where the app is (`location`) and how to move: `navigate(to)` and `back()`. */
export function useNavigation(): Navigation {
  const navigation = use(NavigationContext)
  if (!navigation) throw new Error('useNavigation must be used inside <NavigationProvider>')
  return navigation
}
