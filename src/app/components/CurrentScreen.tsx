import type { AppLocation } from '@/app/utils/location'
import { useNavigation } from '@/app/hooks/useNavigation'
import { TABS, renderScreen } from '@/app/utils/tab-registry'
import { NetworkInfoGate } from '@/app/components/NetworkInfoStates'

/** Home and Speed can't render without network info; the other tabs can. */
function needsNetworkInfo(location: AppLocation): boolean {
  return TABS[location.tab].needsNetworkInfo ?? false
}

/**
 * The screen for the current location: a tab's main page or one of its
 * subpages, as `TABS` maps them. Each view reads its own data and navigation
 * from context.
 */
export function CurrentScreen(): JSX.Element {
  const { location } = useNavigation()
  // Show the loading/error state only in the content area (not full-screen) so
  // the window chrome and tabs stay usable even before info arrives.
  return <NetworkInfoGate isNeeded={needsNetworkInfo(location)}>{renderScreen(location)}</NetworkInfoGate>
}
