import type { AppLocation } from '@/app/utils/location'
import { useNavigation } from '@/app/hooks/useNavigation'
import { HomeView } from '@/features/home/HomeView'
import { SpeedView } from '@/features/speed/SpeedView'
import { InterfacesView } from '@/features/interfaces/InterfacesView'
import { DevicesView } from '@/features/devices/DevicesView'
import { EventsView } from '@/features/events/EventsView'
import { UsageView } from '@/features/usage/UsageView'
import { AppUsageView } from '@/features/apps/AppUsageView'
import { HostsView } from '@/features/apps/HostsView'
import { TrafficView } from '@/features/apps/TrafficView'
import { DiagnosticsView } from '@/features/diagnostics/DiagnosticsView'
import { ServicesView } from '@/features/services/ServicesView'
import { ServicesTimelineView } from '@/features/services/ServicesTimelineView'
import { SettingsView } from '@/features/settings/SettingsView'
import { AboutView } from '@/features/about/AboutView'

/** Home and Speed can't render without network info; the other tabs can. */
export function needsNetworkInfo(location: AppLocation): boolean {
  return location.tab === 'home' || location.tab === 'speed'
}

/**
 * The screen for the current location: a tab's main page or one of its
 * subpages. Each view reads its own data and navigation from context.
 */
export function CurrentScreen(): JSX.Element {
  const { location } = useNavigation()

  switch (location.tab) {
    case 'home':
      return <HomeView />
    case 'speed':
      return <SpeedView />
    case 'interfaces':
      return <InterfacesView />
    case 'devices':
      return <DevicesView />
    case 'events':
      return <EventsView />
    case 'usage':
      return <UsageView />
    case 'apps':
      if (location.appsSub?.view === 'hosts') return <HostsView />
      if (location.appsSub?.view === 'traffic') return <TrafficView />
      return <AppUsageView />
    case 'diagnostics':
      return <DiagnosticsView />
    case 'services':
      if (location.servicesSub?.view === 'timeline') return <ServicesTimelineView />
      return <ServicesView />
    case 'settings':
      return <SettingsView />
    case 'about':
      return <AboutView />
  }
}
