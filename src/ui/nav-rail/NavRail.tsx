import { cva, cx } from 'class-variance-authority'
import { Children, type ComponentProps, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'

import { useRovingFocus } from '../hooks/useRovingFocus'
import type { IconComponent } from '../icons/Icons'
import { Tooltip } from '../tooltip/Tooltip'
import { cn } from '../utils/cn'
import { LAYER_CHROME } from '../utils/layers'

// The accent bar's shape, hugging the rail's left edge. BAR_HEIGHT is its
// `h-20` in px, for centring it on an item, and ACTIVE_BAR repeats the shape
// as `before:` classes: change all three together.
const BAR_SHAPE = 'w-[3px] h-20 rounded-r-full bg-accent'
const BAR_HEIGHT = 20

// The active item's own bar, for an item on its own. Inside a rail it hides,
// and the rail's single bar slides to it instead.
const ACTIVE_BAR = cx(
  "before:absolute before:top-1/2 before:-left-12 before:-translate-y-1/2 before:content-['']",
  'before:h-20 before:w-[3px] before:rounded-r-full before:bg-accent',
  '[[data-nav-rail]_&]:before:hidden',
)

const itemVariants = cva(
  [
    'relative inline-flex size-(--rail-item-size) items-center justify-center rounded-md',
    'transition-[color,background] duration-(--duration-normal) ease-out',
  ],
  {
    variants: {
      isActive: {
        true: ['bg-accent-muted text-accent', ACTIVE_BAR],
        false: 'text-tertiary hover:bg-overlay-subtle hover:text-secondary',
      },
    },
    defaultVariants: { isActive: false },
  },
)

type NavItemProps = Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'type' | 'aria-label'> & {
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
export function NavItem({ label, icon: Icon, isActive = false, onClick, className, ...props }: NavItemProps) {
  return (
    <Tooltip content={label} side="right">
      <button
        {...props}
        type="button"
        className={cn(itemVariants({ isActive }), className)}
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

/**
 * One group's items. Each wrapper is a flex box, so it hugs its 38px button
 * rather than growing a line box around it.
 *
 * Divs, not a list: WebKitGTK 2.52 aborts the page when a screen reader asks
 * for text attributes at the end of the current page's `<li>`, blanking the
 * Linux app on Tab. The landmark and the buttons' names carry the meaning.
 */
function NavGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx(GROUP, className)}>
      {Children.map(children, (item) => (
        <div className="flex">{item}</div>
      ))}
    </div>
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
    const placeBar = (isSliding: boolean): void => {
      const item = rail.querySelector('[aria-current="page"]')
      if (!item) {
        setBar((prev) => ({ ...prev, isVisible: false }))
        return
      }
      const itemBox = item.getBoundingClientRect()
      const top = itemBox.top - rail.getBoundingClientRect().top + (itemBox.height - BAR_HEIGHT) / 2
      setBar((prev) => ({ top, isVisible: true, isSliding: isSliding && prev.isVisible }))
    }
    placeBar(false)
    // Items mark the current page themselves, so watch for it moving.
    const currentPageObserver = new MutationObserver(() => placeBar(true))
    currentPageObserver.observe(rail, { subtree: true, attributeFilter: ['aria-current'] })
    const railResizeObserver = new ResizeObserver(() => placeBar(false))
    railResizeObserver.observe(rail)
    return () => {
      currentPageObserver.disconnect()
      railResizeObserver.disconnect()
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
 * content column, like the title bar. It's one Tab stop, on the current page's
 * item: the arrow keys move between its items.
 */
export function NavRail({ label, main, footer }: NavRailProps) {
  const railRef = useRef<HTMLElement>(null)
  const bar = useActiveBar(railRef)
  useRovingFocus(railRef, { itemSelector: 'button', orientation: 'vertical', currentSelector: '[aria-current="page"]' })
  return (
    // Horizontal padding is symmetric so the active pill and the accent bar read
    // as evenly inset; the top padding matches the content area's so the first
    // item aligns with the first widget.
    <nav
      ref={railRef}
      data-nav-rail
      className={cx(
        'relative flex shrink-0 flex-col items-center justify-between gap-12',
        'border-r border-line bg-chrome px-12 py-12',
        LAYER_CHROME,
      )}
      aria-label={label}
    >
      <span
        aria-hidden
        className={cx(
          'absolute top-0 left-0',
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
          'before:absolute before:top-0 before:-right-12 before:-left-12',
          "before:h-px before:bg-line before:content-['']",
        )}
      >
        {footer}
      </NavGroup>
    </nav>
  )
}
