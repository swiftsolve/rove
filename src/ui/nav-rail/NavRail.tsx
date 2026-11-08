import { cx } from 'class-variance-authority'
import { Children, type ReactNode, useRef } from 'react'

import { useRovingFocus } from '../hooks/useRovingFocus'
import { LAYER_CHROME } from '../utils/layers'
import { useActiveBar } from './hooks/useActiveBar'
import { BAR_SHAPE } from './utils/active-bar'

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
