import type { ButtonHTMLAttributes } from 'react'
import { cva, cx, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

// Hover and press only while the button is usable.
const ACCENT_HOVER = cx(
  'not-disabled:not-aria-disabled:hover:bg-accent-muted',
  'not-disabled:not-aria-disabled:hover:text-accent-text',
)
const PRESS = 'not-disabled:not-aria-disabled:active:transform-[translateY(0.5px)]'

// `disabled`, or `aria-disabled` from `isDisabled`, which looks the same.
const DIMMED = cx(
  'disabled:opacity-(--opacity-disabled) disabled:cursor-not-allowed',
  'aria-disabled:opacity-(--opacity-disabled) aria-disabled:cursor-not-allowed',
)

// The accent buttons' shared shape: the filled one is the primary's layout a
// step bigger, on a solid accent fill.
const ACCENT_BASE = cx(
  'inline-flex items-center justify-center gap-6 rounded-sm',
  'font-semibold',
  'transition-[background,color,transform] duration-(--duration-fast) ease-in-out',
  PRESS,
)

const buttonVariants = cva(undefined, {
  variants: {
    variant: {
      /** Quiet accent text: secondary actions and links in a header. No fill at
       *  rest: the global button reset leaves it transparent. */
      primary: [ACCENT_BASE, 'px-10 py-8 text-xs tracking-button-default text-accent', ACCENT_HOVER],
      /** Solid accent fill: a page's main action (Run test, Add service). */
      filled: [ACCENT_BASE, 'px-(--section-padding) py-10 text-sm tracking-button-large text-on-fill'],
      /** Neutral inset: retries and other in-place actions. */
      secondary: [
        'inline-flex items-center justify-center gap-6 px-12 py-6 rounded-sm',
        'text-xs font-medium bg-inset text-secondary',
        'transition-[color,background] duration-(--duration-fast) ease-in-out',
        'not-disabled:not-aria-disabled:hover:text-primary not-disabled:not-aria-disabled:hover:bg-hover',
        PRESS,
      ],
    },
    /** The filled button while a test runs: red, for Stop. */
    isStop: { true: null, false: null },
    /**
     * In flight: full opacity (the spinner shows the wait, so no dimming even
     * while `disabled`) and no input.
     */
    isBusy: { true: 'pointer-events-none cursor-default', false: DIMMED },
  },
  compoundVariants: [
    {
      variant: 'filled',
      isStop: false,
      class: 'bg-accent-fill not-disabled:not-aria-disabled:hover:bg-accent-fill-hover',
    },
    {
      variant: 'filled',
      isStop: true,
      class: 'bg-status-negative-fill not-disabled:not-aria-disabled:hover:bg-status-negative-fill-hover',
    },
  ],
  defaultVariants: { variant: 'secondary', isStop: false, isBusy: false },
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
  /**
   * Unavailable, but still focusable so its reason (usually a Tooltip) can be
   * reached by keyboard and read by screen readers: sets `aria-disabled`,
   * ignores clicks, and looks the same as `disabled`.
   */
  isDisabled?: boolean
  }

/** A text button. Extra props (aria-*, handlers from a Tooltip) pass straight to the `<button>`. */
export function Button({
  variant,
  isStop,
  isBusy,
  className,
  type = 'button',
  isDisabled,
  onClick,
  ...buttonProps
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, isStop, isBusy }), className)}
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? undefined : onClick}
      {...buttonProps}
    />
  )
}
