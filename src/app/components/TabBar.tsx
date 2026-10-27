import type { JSX } from 'react'
import { cva } from 'class-variance-authority'
import type { AppTab } from '@/app/utils/tabs'
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
} from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useTheme } from '@/app/hooks/useTheme'
import { cx } from '@/lib/cx'
import styles from './TabBar.module.css'

const itemVariants = cva(styles.item, {
  variants: {
    isActive: { true: styles.isActive },
  },
})

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

// Settings also stays lit on About, which is reached from inside Settings.
const SUBPAGE_TABS: Partial<Record<AppTab, AppTab[]>> = { settings: ['about'] }

function NavItem({ tab }: { tab: TabDefinition }): JSX.Element {
  const { location, navigate } = useNavigation()
  const isActive = location.tab === tab.id || (SUBPAGE_TABS[tab.id]?.includes(location.tab) ?? false)
  return (
    <Tooltip content={tab.label} placement="right">
      <button
        type="button"
        className={itemVariants({ isActive })}
        onClick={() => navigate({ tab: tab.id })}
        aria-current={isActive ? 'page' : undefined}
        aria-label={tab.label}
      >
        <tab.Icon size={18} className={styles.icon} />
      </button>
    </Tooltip>
  )
}

function ThemeToggle(): JSX.Element {
  const { isLight, toggle } = useTheme()
  // Show the glyph for the mode you'll switch *to*, matching the tooltip.
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode'
  const Icon = isLight ? MoonIcon : SunIcon
  return (
    <Tooltip content={label} placement="right">
      <button type="button" className={itemVariants()} onClick={toggle} aria-label={label}>
        <Icon size={18} className={styles.icon} />
      </button>
    </Tooltip>
  )
}

/** The nav rail: one button per tab, plus the theme toggle and Settings at the foot. */
export function TabBar(): JSX.Element {
  return (
    <nav className={styles.rail} aria-label="Main navigation">
      <div className={styles.group}>
        {TAB_DEFINITIONS.map((tab) => (
          <NavItem key={tab.id} tab={tab} />
        ))}
      </div>
      <div className={cx(styles.group, styles.bottomGroup)}>
        {/* Theme toggle sits above the gear; About lives inside the Settings page. */}
        <ThemeToggle />
        <NavItem tab={SETTINGS_TAB} />
      </div>
    </nav>
  )
}
