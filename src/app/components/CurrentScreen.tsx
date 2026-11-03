import { NetworkInfoGate } from '@/app/components/NetworkInfoStates'
import { useNavigation } from '@/app/hooks/useNavigation'
import type { AppLocation } from '@/app/utils/location'
import { renderScreen, TABS } from '@/app/utils/tab-registry'

/** Whether the location's tab can't render without network info. */
function needsNetworkInfo(location: AppLocation): boolean {
  return TABS[location.tab].needsNetworkInfo ?? false
}

/**
 * The screen for the current location: a tab's main page or one of its
 * subpages, as `TABS` maps them. Each view reads its own data and navigation
 * from context.
 */
export function CurrentScreen() {
  const { location } = useNavigation()
  // In the content area only, so the chrome and tabs stay usable meanwhile.
  return <NetworkInfoGate isNeeded={needsNetworkInfo(location)}>{renderScreen(location)}</NetworkInfoGate>
}
