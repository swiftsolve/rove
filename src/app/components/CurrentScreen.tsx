import type { AppLocation } from '@/app/utils/location'
import { useNavigation } from '@/app/hooks/useNavigation'
import { TABS, renderScreen } from '@/app/utils/tab-registry'

/** Home and Speed can't render without network info; the other tabs can. */
export function needsNetworkInfo(location: AppLocation): boolean {
  return TABS[location.tab].needsNetworkInfo ?? false
}

/**
 * The screen for the current location: a tab's main page or one of its
 * subpages, as `TABS` maps them. Each view reads its own data and navigation
 * from context.
 */
export function CurrentScreen(): JSX.Element {
  const { location } = useNavigation()
  return renderScreen(location)
}
