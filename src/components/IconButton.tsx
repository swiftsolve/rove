import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { Tooltip } from '@/components/Tooltip'
import type { IconComponent } from '@/components/icons/Icons'
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
        /** Neutral inset chip: refresh, help, share. */
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

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'aria-label' | 'children'> &
  VariantProps<typeof iconButtonVariants> & {
    /** Names the button (it has no visible text) and is its tooltip, unless `tooltip` says more. */
    label: string
    icon: IconComponent
    /** 16, or 14 for a glyph that reads large (Play). The spinner matches it. */
    iconSize?: 16 | 14
    /** The tooltip, when it should say more than the label (a help button's hint). */
    tooltip?: ReactNode
    tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  }

/**
 * A square, icon-only button with a tooltip. While `isLoading` a spinner takes
 * the icon's place. Disabled and loading work as on Button: both drop clicks
 * and stay focusable; only disabled dims. Extra props pass straight to the
 * `<button>`.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant,
    label,
    icon: Icon,
    iconSize = 16,
    tooltip,
    tooltipSide,
    isDisabled,
    isLoading,
    className,
    type = 'button',
    onClick,
    ...buttonProps
  },
  ref,
) {
  return (
    <Tooltip content={tooltip ?? label} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        className={cn(iconButtonVariants({ variant, isDisabled, isLoading }), className)}
        aria-label={label}
        {...buttonStateProps({ isDisabled, isLoading, onClick })}
        {...buttonProps}
      >
        {isLoading ? <ButtonSpinner size={iconSize} /> : <Icon size={iconSize} />}
      </button>
    </Tooltip>
  )
})
