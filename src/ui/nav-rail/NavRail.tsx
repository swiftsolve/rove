import { Children, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { Tooltip } from '../tooltip/Tooltip'
import type { IconComponent } from '../icons/Icons'

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

interface NavItemProps {
  /** Names the item, which shows only its icon; also its tooltip. */
  label: string
  /** The icon. */
  icon: IconComponent
  /** The current page's item: tinted, with the accent bar. */
  isActive?: boolean
  /** Goes to the page, or runs the action. */
  onClick: () => void
}

/** One rail button: a page, or an action such as the theme switch. */
export function NavItem({ label, icon: Icon, isActive = false, onClick }: NavItemProps): JSX.Element {
  return (
    <Tooltip content={label} side="right">
      <button
        type="button"
        className={itemVariants({ isActive })}
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
      >
        <Icon size={18} className="shrink-0" />
      </button>
    </Tooltip>
  )
}

const GROUP = 'flex flex-col items-center gap-12'

/** One group's items, each a flex item so it shrinks to its 38px control rather than growing a line box. */
function NavGroup({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <ul role="list" className={cx(GROUP, className)}>
      {Children.map(children, (item) => (
        <li className="flex">{item}</li>
      ))}
    </ul>
  )
}

interface NavRailProps {
  /** Accessible name for the navigation landmark. */
  label: string
  /** The pages, from the top. */
  main: ReactNode
  /** Utilities at the bottom edge, below a hairline: settings, the theme switch. */
  footer: ReactNode
}

/**
 * The narrow icon-only rail down the window's left side. It stays above the
 * content column, like the title bar.
 */
export function NavRail({ label, main, footer }: NavRailProps): JSX.Element {
  return (
    // Horizontal padding is symmetric so the active pill and the accent bar read
    // as evenly inset; the top padding matches the content area's so the first
    // item aligns with the first widget.
    <nav
      className={cx(
        'relative z-100 flex flex-col items-center justify-between gap-12 shrink-0',
        'px-12 py-12 bg-chrome border-r border-line',
      )}
      aria-label={label}
    >
      <NavGroup>{main}</NavGroup>
      {/* The hairline cancels the rail's side padding, so it runs edge to edge
          like the panel borders. */}
      <NavGroup
        className={cx(
          'relative pt-12',
          'before:absolute before:top-0 before:-left-12 before:-right-12',
          "before:h-px before:bg-line before:content-['']",
        )}
      >
        {footer}
      </NavGroup>
    </nav>
  )
}
