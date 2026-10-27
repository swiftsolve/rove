import type { JSX } from 'react'
import { cva, cx } from 'class-variance-authority'
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

// The active item's vertical accent bar, hugging the rail's left edge.
const ACTIVE_BAR = cx(
  "before:absolute before:-left-11 before:top-1/2 before:transform-[translateY(-50%)] before:content-['']",
  'before:w-[3px] before:h-[20px] before:rounded-[0_3px_3px_0] before:bg-accent',
)

const itemVariants = cva(
  [
    'relative inline-flex items-center justify-center size-[38px] rounded-md',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      isActive: {
        true: ['bg-accent-muted text-accent', ACTIVE_BAR],
        false: 'text-tertiary hover:text-secondary hover:bg-fill-nav-hover',
      },
    },
    defaultVariants: { isActive: false },
  },
)

const GROUP = 'flex flex-col items-center gap-12'

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
        <tab.Icon size={18} className="shrink-0" />
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
        <Icon size={18} className="shrink-0" />
      </button>
    </Tooltip>
  )
}

/** The nav rail: one button per tab, plus the theme toggle and Settings at the foot. */
export function TabBar(): JSX.Element {
  return (
    // Narrow icon-only rail: the primary items at the top, the utility group
    // pushed to the bottom edge. Horizontal padding is symmetric so the active pill
    // and the accent bar read as evenly inset; the top padding matches the content
    // area's so the first item aligns with the first widget. Like the title bar, it
    // stays above the content column.
    <nav
      className={cx(
        'relative z-100 flex flex-col items-center justify-between gap-12 shrink-0',
        'px-11 py-12 bg-chrome border-r border-line',
      )}
      aria-label="Main navigation"
    >
      <ul role="list" className={GROUP}>
        {/* Flex items, so each shrinks to its 38px control instead of growing a
            line box (and its descender gap) round it. */}
        {TAB_DEFINITIONS.map((tab) => (
          <li key={tab.id} className="flex">
            <NavItem tab={tab} />
          </li>
        ))}
      </ul>
      {/* Separated from the primary items by a hairline that cancels the rail's
          11px side padding, so it runs edge to edge like the panel borders. */}
      <ul
        role="list"
        className={cx(
          GROUP,
          'relative pt-12',
          "before:absolute before:top-[0] before:-left-11 before:-right-11 before:h-px before:bg-line before:content-['']",
        )}
      >
        {/* Theme toggle sits above the gear; About lives inside the Settings page. */}
        <li className="flex">
          <ThemeToggle />
        </li>
        <li className="flex">
          <NavItem tab={SETTINGS_TAB} />
        </li>
      </ul>
    </nav>
  )
}
