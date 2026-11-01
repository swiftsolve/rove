import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, cx, type VariantProps } from 'class-variance-authority'
import { cn } from '../../foundations/cn'
import { ButtonSpinner } from '../spinner/ButtonSpinner'
import type { IconComponent } from '../../icons/Icons'
import { BUTTON_PRESS, BUTTON_STATE_VARIANTS, buttonStateProps } from './button-state'

// The filled buttons: a solid fill under a white label.
const FILLED_BASE = cx(
  'inline-flex items-center justify-center gap-6 rounded-sm',
  'px-(--card-padding) py-10 text-sm font-semibold tracking-label-large text-on-fill',
  'transition-[background,color,transform] duration-(--duration-fast) ease-in-out',
  BUTTON_PRESS,
)

const buttonVariants = cva(undefined, {
  variants: {
    variant: {
      /** Solid accent fill: a page's main action (Run test, Add service). */
      filled: [FILLED_BASE, 'bg-accent-fill not-aria-disabled:not-aria-busy:hover:bg-accent-fill-hover'],
      /** Solid red fill: stops the main action (Stop while a test runs). */
      danger: [
        FILLED_BASE,
        'bg-status-negative-fill not-aria-disabled:not-aria-busy:hover:bg-status-negative-fill-hover',
      ],
      /** Neutral inset: everything else (Rescan, Install & restart). */
      secondary: [
        'inline-flex items-center justify-center gap-6 px-12 py-6 rounded-sm',
        'text-xs font-medium bg-inset text-secondary',
        'transition-[color,background] duration-(--duration-fast) ease-in-out',
        'not-aria-disabled:not-aria-busy:hover:text-primary not-aria-disabled:not-aria-busy:hover:bg-hover',
        BUTTON_PRESS,
      ],
    },
    ...BUTTON_STATE_VARIANTS,
  },
  defaultVariants: { variant: 'secondary' },
})

/** Every variant's glyph, and the spinner that takes its place while loading. */
const ICON_SIZE = 13

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> &
  VariantProps<typeof buttonVariants> & {
    /** A glyph before the label, drawn at the button's icon size. */
    icon?: IconComponent
  }

/**
 * A text button, with an optional icon before its label. While `isLoading` a
 * spinner takes the icon's place (or comes first, with no icon) and clicks drop;
 * `isDisabled` dims it and drops clicks. Both keep it focusable, so a Tooltip
 * explaining why still works. Extra props (aria-*, handlers from a Tooltip) pass
 * straight to the `<button>`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, icon: Icon, isDisabled, isLoading, className, type = 'button', onClick, children, ...buttonProps },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, isDisabled, isLoading }), className)}
      {...buttonStateProps({ isDisabled, isLoading, onClick })}
      {...buttonProps}
    >
      {isLoading ? <ButtonSpinner size={ICON_SIZE} /> : Icon && <Icon size={ICON_SIZE} />}
      {children}
    </button>
  )
})
