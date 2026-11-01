import type { JSX } from 'react'
import { cva, cx } from 'class-variance-authority'
import { APP_TABS, type AppTab } from '@/app/utils/tabs'
import { TABS } from '@/app/utils/tab-registry'
import { MoonIcon, SunIcon } from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useTheme } from '@/app/hooks/useTheme'

// The active item's vertical accent bar, hugging the rail's left edge.
const ACTIVE_BAR = cx(
  "before:absolute before:-left-12 before:top-1/2 before:-translate-y-1/2 before:content-['']",
  'before:w-[3px] before:h-20 before:rounded-[0_3px_3px_0] before:bg-accent',
)

const itemVariants = cva(
  [
    'relative inline-flex items-center justify-center size-(--rail-item-size) rounded-md',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      isActive: {
        true: ['bg-accent-muted text-accent', ACTIVE_BAR],
        false: 'text-tertiary hover:text-secondary hover:bg-fill-subtle',
      },
    },
    defaultVariants: { isActive: false },
  },
)

const GROUP = 'flex flex-col items-center gap-12'

const MAIN_TABS = APP_TABS.filter((id) => TABS[id].rail === 'main')
const FOOT_TABS = APP_TABS.filter((id) => TABS[id].rail === 'foot')

function NavItem({ id }: { id: AppTab }): JSX.Element {
  const { location, navigate } = useNavigation()
  const tab = TABS[id]
  const isActive = (TABS[location.tab].railTab ?? location.tab) === id
  return (
    <Tooltip content={tab.label} placement="right">
      <button
        type="button"
        className={itemVariants({ isActive })}
        onClick={() => navigate({ tab: id })}
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
        'px-12 py-12 bg-base border-r border-line',
      )}
      aria-label="Main navigation"
    >
      <ul role="list" className={GROUP}>
        {/* Flex items, so each shrinks to its 38px control instead of growing a
            line box (and its descender gap) round it. */}
        {MAIN_TABS.map((id) => (
          <li key={id} className="flex">
            <NavItem id={id} />
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
          "before:absolute before:top-0 before:-left-12 before:-right-12 before:h-px before:bg-line before:content-['']",
        )}
      >
        {/* Theme toggle sits above the gear; About lives inside the Settings page. */}
        <li className="flex">
          <ThemeToggle />
        </li>
        {FOOT_TABS.map((id) => (
          <li key={id} className="flex">
            <NavItem id={id} />
          </li>
        ))}
      </ul>
    </nav>
  )
}
