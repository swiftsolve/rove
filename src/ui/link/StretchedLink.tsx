import type { ComponentProps, MouseEventHandler } from 'react'

import { cn } from '../foundations/cn'

type StretchedLinkProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children' | 'role' | 'onClick'> & {
  /**
   * Names it: it has no text of its own, since the container's content shows
   * through. Leave it out only to name it by a heading (`aria-labelledby`).
   */
  label?: string
  /** Opens the view the container summarises. */
  onClick?: MouseEventHandler<HTMLButtonElement>
}

/**
 * A transparent link stretched over its positioned container (a row; a Card
 * draws its own with `onOpen`),
 * so a click anywhere opens the view the container summarises. It's a link
 * to a screen reader: it moves to another view rather than acting. A control
 * in the container raises itself above it and stays a sibling, never nested.
 * Its focus ring follows the container's corners, just inside the edge.
 * `data-stretched-link` lets the container style itself while it has focus;
 * `className` can round the ring where the container's own corners don't (a
 * list's first and last rows).
 */
export function StretchedLink({ label, type = 'button', className, ...buttonProps }: StretchedLinkProps) {
  return (
    // A button, as the app has no URLs to link to: views change through
    // history state (see Link).
    <button
      type={type}
      role="link"
      className={cn('absolute inset-0 z-1 rounded-[inherit] focus-visible:outline-offset-(--focus-inset)', className)}
      aria-label={label}
      data-stretched-link=""
      {...buttonProps}
    />
  )
}
