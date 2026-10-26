import { memo, type JSX } from 'react'
import type { AppTab } from '@/navigation/tabs'
import {
  AppsIcon,
  CloudIcon,
  ConnectionIcon,
  DevicesIcon,
  EventsIcon,
  HomeIcon,
  LayersIcon,
  MoonIcon,
  SettingsIcon,
  SpeedIcon,
  SunIcon,
  UsageIcon,
} from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import './TabBar.css'

interface TabBarProps {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
  /** Whether the light theme is active — drives the toggle's icon and label. */
  isLightMode: boolean
  /** Flip between light and dark themes. */
  onToggleTheme: () => void
}

interface TabIconProps {
  size?: number
  className?: string
}

interface TabDefinition {
  id: AppTab
  label: string
  Icon: (props: TabIconProps) => JSX.Element
}

// Primary navigation — the top group of the rail.
const TAB_DEFINITIONS: TabDefinition[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'speed', label: 'Speed', Icon: SpeedIcon },
  { id: 'devices', label: 'Devices', Icon: DevicesIcon },
  { id: 'apps', label: 'Apps', Icon: AppsIcon },
  { id: 'services', label: 'Services', Icon: CloudIcon },
  { id: 'events', label: 'Timeline', Icon: EventsIcon },
  { id: 'interfaces', label: 'Interfaces', Icon: LayersIcon },
  { id: 'diagnostics', label: 'Connection', Icon: ConnectionIcon },
  { id: 'usage', label: 'Usage', Icon: UsageIcon },
]

// The gear sitting on its own at the foot of the rail. About is reached from
// within the Settings page rather than the rail.
const SETTINGS_TAB: TabDefinition = { id: 'settings', label: 'Settings', Icon: SettingsIcon }

function NavItem({
  tab,
  isActive,
  onChange,
}: {
  tab: TabDefinition
  isActive: boolean
  onChange: (tab: AppTab) => void
}): JSX.Element {
  return (
    <Tooltip content={tab.label} placement="right">
      <button
        type="button"
        className={`nav-item nav-item-${tab.id} ${isActive ? 'active' : ''}`}
        onClick={() => onChange(tab.id)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={tab.label}
      >
        <tab.Icon size={18} className="nav-icon" />
      </button>
    </Tooltip>
  )
}

function ThemeToggle({
  isLightMode,
  onToggle,
}: {
  isLightMode: boolean
  onToggle: () => void
}): JSX.Element {
  // Show the glyph for the mode you'll switch *to*, matching the tooltip.
  const label = isLightMode ? 'Switch to dark mode' : 'Switch to light mode'
  return (
    <Tooltip content={label} placement="right">
      <button type="button" className="nav-item" onClick={onToggle} aria-label={label}>
        {isLightMode ? (
          <MoonIcon size={18} className="nav-icon" />
        ) : (
          <SunIcon size={18} className="nav-icon" />
        )}
      </button>
    </Tooltip>
  )
}

export default memo(function TabBar({
  activeTab,
  onChange,
  isLightMode,
  onToggleTheme,
}: TabBarProps) {
  return (
    <nav className="nav-rail" aria-label="Main navigation">
      <div className="nav-items">
        {TAB_DEFINITIONS.map((tab) => (
          <NavItem key={tab.id} tab={tab} isActive={tab.id === activeTab} onChange={onChange} />
        ))}
      </div>
      <div className="nav-items nav-items-bottom">
        {/* Theme toggle sits above the gear; About lives inside the Settings page. */}
        <ThemeToggle isLightMode={isLightMode} onToggle={onToggleTheme} />
        <NavItem
          tab={SETTINGS_TAB}
          isActive={activeTab === 'settings' || activeTab === 'about'}
          onChange={onChange}
        />
      </div>
    </nav>
  )
})
