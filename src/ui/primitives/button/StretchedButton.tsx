import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../foundations/cn'

type StretchedButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  /** Names it: it has no text of its own, since the container's content shows through. */
  label: string
}

/**
 * A transparent button stretched over its positioned container (a card, a
 * row), so a click anywhere opens what the container summarises. A control in
 * the container raises itself above it and stays a sibling, never nested.
 * Its focus ring follows the container's corners, just inside the edge.
 * `data-stretched-button` lets the container style itself while it has focus;
 * `className` can round the ring where the container's own corners don't (a
 * list's first and last rows).
 */
export const StretchedButton = forwardRef<HTMLButtonElement, StretchedButtonProps>(function StretchedButton(
  { label, type = 'button', className, ...buttonProps },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('absolute inset-0 z-1 rounded-[inherit] focus-visible:outline-offset-(--focus-inset)', className)}
      aria-label={label}
      data-stretched-button=""
      {...buttonProps}
    />
  )
})
