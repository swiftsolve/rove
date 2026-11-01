import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { BUTTON_PRESS, BUTTON_STATE_VARIANTS, buttonStateProps } from '@/components/utils/button-state'

const iconButtonVariants = cva(
  [
    'inline-flex items-center justify-center size-[28px] rounded-sm',
    'transition-[color,background,transform] duration-(--duration-fast) ease-in-out',
    BUTTON_PRESS,
  ],
  {
    variants: {
      variant: {
        /** Neutral inset chip: refresh, overflow menus. */
        secondary: [
          'bg-inset text-secondary',
          'not-aria-disabled:not-aria-busy:hover:bg-hover not-aria-disabled:not-aria-busy:hover:text-primary',
        ],
        /** No fill or colour of its own; the context styles it (a dialog's close). */
        plain: null,
      },
      ...BUTTON_STATE_VARIANTS,
    },
    defaultVariants: { variant: 'secondary' },
  },
)

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> &
  VariantProps<typeof iconButtonVariants> & {
    /** Required: an icon-only button has no visible text to name it. */
    'aria-label': string
  }

/**
 * A square, icon-only button. Disabled and loading work as on Button: both
 * drop clicks and stay focusable; only disabled dims. Extra props pass
 * straight to the `<button>`.
 */
export function IconButton({
  variant,
  isDisabled,
  isLoading,
  className,
  type = 'button',
  onClick,
  ...buttonProps
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cn(iconButtonVariants({ variant, isDisabled, isLoading }), className)}
      {...buttonStateProps({ isDisabled, isLoading, onClick })}
      {...buttonProps}
    />
  )
}
