import { createElement, type JSX, type ReactElement } from 'react'
import type { AppTab } from '@/app/utils/tabs'
import type { AppLocation } from '@/app/utils/location'
import {
  AppsIcon,
  CloudIcon,
  ConnectionIcon,
  DevicesIcon,
  EventsIcon,
  HomeIcon,
  LayersIcon,
  SettingsIcon,
  SpeedIcon,
  UsageIcon,
} from '@/ui'
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

type Screen = () => JSX.Element | null

export type TabDefinition = {
  label: string
  Icon: (props: { size?: number; className?: string }) => JSX.Element
  /** The tab's main page. */
  Screen: Screen
  /** A subpage of the tab for this location, or null for its main page. */
  subScreen?: (location: AppLocation) => Screen | null
  /** Where its rail button sits: the main group, the footer, or none. */
  rail: 'main' | 'footer' | null
  /** The rail button lit while it shows, when it has none of its own. */
  railTab?: AppTab
  /** It can't render until network info has arrived. */
  needsNetworkInfo?: boolean
}

/** Everything about each tab, in one place: a new tab is one entry here. */
export const TABS: Record<AppTab, TabDefinition> = {
  home: { label: 'Home', Icon: HomeIcon, Screen: HomeView, rail: 'main', needsNetworkInfo: true },
  speed: { label: 'Speed', Icon: SpeedIcon, Screen: SpeedView, rail: 'main', needsNetworkInfo: true },
  devices: { label: 'Devices', Icon: DevicesIcon, Screen: DevicesView, rail: 'main' },
  apps: {
    label: 'Apps',
    Icon: AppsIcon,
    Screen: AppUsageView,
    subScreen: ({ appsSub }) => {
      if (appsSub?.view === 'hosts') return HostsView
      if (appsSub?.view === 'traffic') return TrafficView
      return null
    },
    rail: 'main',
  },
  services: {
    label: 'Services',
    Icon: CloudIcon,
    Screen: ServicesView,
    subScreen: ({ servicesSub }) => (servicesSub?.view === 'timeline' ? ServicesTimelineView : null),
    rail: 'main',
  },
  events: { label: 'Timeline', Icon: EventsIcon, Screen: EventsView, rail: 'main' },
  interfaces: { label: 'Interfaces', Icon: LayersIcon, Screen: InterfacesView, rail: 'main' },
  diagnostics: { label: 'Connection', Icon: ConnectionIcon, Screen: DiagnosticsView, rail: 'main' },
  usage: { label: 'Usage', Icon: UsageIcon, Screen: UsageView, rail: 'main' },
  // The gear sits on its own in the rail's footer.
  settings: { label: 'Settings', Icon: SettingsIcon, Screen: SettingsView, rail: 'footer' },
  // Reached from inside Settings rather than the rail, so Settings stays lit.
  about: { label: 'About', Icon: SettingsIcon, Screen: AboutView, rail: null, railTab: 'settings' },
}

/** The screen for a location: its tab's subpage, or else its main page. Built
 *  here, from the module-level `TABS`, so each screen keeps one component
 *  identity across renders. */
export function renderScreen(location: AppLocation): ReactElement {
  const tab = TABS[location.tab]
  return createElement(tab.subScreen?.(location) ?? tab.Screen)
}
