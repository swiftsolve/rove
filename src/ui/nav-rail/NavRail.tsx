import { cva, cx } from 'class-variance-authority'
import { Children, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'

import type { IconComponent } from '../icons/Icons'
import { Tooltip } from '../tooltip/Tooltip'

// The accent bar's shape, hugging the rail's left edge.
const BAR_SHAPE = 'w-[3px] h-20 rounded-[0_3px_3px_0] bg-accent'
const BAR_HEIGHT = 20

// The active item's own bar, for an item on its own. Inside a rail it hides,
// and the rail's single bar slides to it instead.
const ACTIVE_BAR = cx(
  "before:absolute before:-left-12 before:top-1/2 before:-translate-y-1/2 before:content-['']",
  'before:w-[3px] before:h-20 before:rounded-[0_3px_3px_0] before:bg-accent',
  '[[data-nav-rail]_&]:before:hidden',
)

const itemVariants = cva(
  [
    'relative inline-flex items-center justify-center size-(--rail-item-size) rounded-md',
    'transition-[color,background] duration-(--duration-normal) ease-out',
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

type NavItemProps = {
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
export function NavItem({ label, icon: Icon, isActive = false, onClick }: NavItemProps) {
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
function NavGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ul role="list" className={cx(GROUP, className)}>
      {Children.map(children, (item) => (
        <li className="flex">{item}</li>
      ))}
    </ul>
  )
}

type BarPlacement = {
  /** Offset from the rail's top. */
  top: number
  /** Whether an item is the current page. */
  isVisible: boolean
  /** Slides from its last spot; off when it first appears and on resizes, so it lands there. */
  isSliding: boolean
}

/** Follows the current page's item, so one accent bar can slide between items. */
function useActiveBar(railRef: RefObject<HTMLElement | null>): BarPlacement {
  const [bar, setBar] = useState<BarPlacement>({ top: 0, isVisible: false, isSliding: false })
  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const place = (isSliding: boolean): void => {
      const item = rail.querySelector('[aria-current="page"]')
      if (!item) {
        setBar((prev) => ({ ...prev, isVisible: false }))
        return
      }
      const box = item.getBoundingClientRect()
      const top = box.top - rail.getBoundingClientRect().top + (box.height - BAR_HEIGHT) / 2
      setBar((prev) => ({ top, isVisible: true, isSliding: isSliding && prev.isVisible }))
    }
    place(false)
    // Items mark the current page themselves, so watch for it moving.
    const pageChanges = new MutationObserver(() => place(true))
    pageChanges.observe(rail, { subtree: true, attributeFilter: ['aria-current'] })
    const resizes = new ResizeObserver(() => place(false))
    resizes.observe(rail)
    return () => {
      pageChanges.disconnect()
      resizes.disconnect()
    }
  }, [railRef])
  return bar
}

type NavRailProps = {
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
export function NavRail({ label, main, footer }: NavRailProps) {
  const railRef = useRef<HTMLElement>(null)
  const bar = useActiveBar(railRef)
  return (
    // Horizontal padding is symmetric so the active pill and the accent bar read
    // as evenly inset; the top padding matches the content area's so the first
    // item aligns with the first widget.
    <nav
      ref={railRef}
      data-nav-rail
      className={cx(
        'relative z-100 flex flex-col items-center justify-between gap-12 shrink-0',
        'px-12 py-12 bg-chrome border-r border-line',
      )}
      aria-label={label}
    >
      <span
        aria-hidden
        className={cx(
          'absolute left-0 top-0',
          BAR_SHAPE,
          bar.isVisible ? 'opacity-100' : 'opacity-0',
          bar.isSliding
            ? 'transition-[transform,opacity] duration-(--duration-normal) ease-out'
            : 'transition-opacity duration-(--duration-normal) ease-out',
        )}
        style={{ transform: `translateY(${bar.top}px)` }}
      />
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
