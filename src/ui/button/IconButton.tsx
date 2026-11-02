import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../foundations/cn'
import { ButtonSpinner } from '../spinner/ButtonSpinner'
import { Tooltip } from '../tooltip/Tooltip'
import type { IconComponent } from '../icons/Icons'
import { PRESS, STATE_CLASSES, pressableProps } from '../foundations/pressable'

const iconButtonVariants = cva(
  [
    'inline-flex items-center justify-center size-[28px] rounded-sm',
    'text-secondary usable:hover:bg-hover usable:hover:text-primary',
    'transition-[color,background,transform] duration-(--duration-fast) ease-in-out',
    STATE_CLASSES,
    PRESS,
  ],
  {
    variants: {
      variant: {
        /** A neutral inset chip, like a soft Button. */
        soft: 'bg-inset',
        /** No fill until hovered: it takes the colour of what it sits on. */
        ghost: null,
      },
    },
    defaultVariants: { variant: 'soft' },
  },
)

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'aria-label' | 'children'> &
  {
    /** Names the button (it has no visible text) and is its tooltip, unless `tooltip` says more. */
    label: string
    icon: IconComponent
    variant?: 'soft' | 'ghost'
    /** 16, or 14 for an icon that reads large (Play). The spinner matches it. */
    iconSize?: 16 | 14
    /** The tooltip, when it should say more than the label (a help button's hint). */
    tooltip?: ReactNode
    tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
    /** Drops input and dims the button. It stays focusable, so its tooltip can say why. */
    isDisabled?: boolean
    /** Drops input and swaps the icon for a spinner. */
    isLoading?: boolean
  }

/**
 * A square, icon-only button with a tooltip. Disabled and loading work as on
 * Button. Extra props pass straight to the `<button>`.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon: Icon,
    variant,
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
        className={cn(iconButtonVariants({ variant }), className)}
        aria-label={label}
        {...pressableProps({ isDisabled, isLoading, onClick })}
        {...buttonProps}
      >
        {isLoading ? <ButtonSpinner size={iconSize} /> : <Icon size={iconSize} />}
      </button>
    </Tooltip>
  )
})
