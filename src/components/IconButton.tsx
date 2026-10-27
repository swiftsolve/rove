import type { ButtonHTMLAttributes } from 'react'
import { cva, cx, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const iconButtonVariants = cva(
  [
    'inline-flex items-center justify-center size-[28px] rounded-sm',
    'transition-[color,background,transform] duration-(--duration-fast) ease-in-out',
    // Pressed (and, per tone, hovered) only while the button is usable.
    'not-disabled:not-aria-disabled:active:transform-[translateY(0.5px)]',
  ],
  {
    variants: {
      tone: {
        /** No fill or colour of its own; the context styles it. */
        plain: null,
        /** Accent glyph, tinted on hover. */
        primary: cx(
          'bg-transparent text-accent',
          'not-disabled:not-aria-disabled:hover:bg-accent-muted',
          'not-disabled:not-aria-disabled:hover:text-accent-hover',
        ),
        /** Neutral inset chip: refresh, close, overflow menus. */
        secondary: cx(
          'bg-inset text-secondary',
          'not-disabled:not-aria-disabled:hover:bg-hover not-disabled:not-aria-disabled:hover:text-primary',
        ),
        /** Red, for stopping something in progress. */
        stop: cx(
          'bg-[color-mix(in_srgb,var(--status-negative)_var(--opacity-tint-md),transparent)] text-status-negative',
          'hover:bg-[color-mix(in_srgb,var(--status-negative)_var(--opacity-tint-lg),transparent)]',
          '[&_svg]:fill-current',
        ),
      },
      /**
       * In flight: full opacity (the spinner shows the wait, so buttons that
       * stay `disabled` while busy don't fade it) and no pointer input.
       */
      isBusy: {
        true: 'pointer-events-none cursor-default',
        false: cx(
          'disabled:opacity-(--opacity-disabled) disabled:cursor-not-allowed',
          'aria-disabled:opacity-(--opacity-disabled) aria-disabled:cursor-not-allowed',
        ),
      },
    },
    defaultVariants: { tone: 'secondary', isBusy: false },
  },
)

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    /** Required: an icon-only button has no visible text to name it. */
    'aria-label': string
    /**
     * Unavailable, but still focusable so its reason (usually a Tooltip) can be
     * reached by keyboard and read by screen readers: sets `aria-disabled`,
     * ignores clicks, and looks the same as `disabled`.
     */
    isDisabled?: boolean
  }

/** A square, icon-only button. Extra props pass straight to the `<button>`. */
export function IconButton({
  tone,
  isBusy,
  className,
  type = 'button',
  isDisabled,
  onClick,
  ...buttonProps
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cn(iconButtonVariants({ tone, isBusy }), className)}
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? undefined : onClick}
      {...buttonProps}
    />
  )
}
