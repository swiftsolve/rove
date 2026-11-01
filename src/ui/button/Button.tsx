import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../foundations/cn'
import { ButtonSpinner } from '../spinner/ButtonSpinner'
import type { IconComponent } from '../icons/Icons'
import { PRESS, STATE_CLASSES, pressableProps } from '../foundations/pressable'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center rounded-sm',
    'transition-[color,background,transform] duration-(--duration-fast) ease-in-out',
    PRESS,
    STATE_CLASSES,
  ],
  {
    variants: {
      variant: {
        /** A solid fill under a white label: a page's main action, or stopping it. */
        solid: 'text-on-fill',
        /** A quiet tinted chip: everything else. */
        soft: 'bg-inset text-secondary usable:hover:bg-hover usable:hover:text-primary',
      },
      tone: { accent: null, negative: null },
      size: {
        sm: 'gap-6 px-10 py-6 text-xs font-medium',
        md: 'gap-6 px-(--card-padding) py-10 text-sm font-semibold tracking-label-large',
      },
    },
    compoundVariants: [
      { variant: 'solid', tone: 'accent', class: 'bg-accent-fill usable:hover:bg-accent-fill-hover' },
      {
        variant: 'solid',
        tone: 'negative',
        class: 'bg-status-negative-fill usable:hover:bg-status-negative-fill-hover',
      },
    ],
  },
)

/**
 * What a button looks like. Only a solid button takes a tone: the accent, or
 * negative to stop something. A solid defaults to `md`, a soft one to `sm`.
 */
export type ButtonAppearance =
  | { variant: 'solid'; tone?: 'accent' | 'negative'; size?: 'sm' | 'md' }
  | { variant?: 'soft'; tone?: never; size?: 'sm' | 'md' }

type Variant = NonNullable<ButtonAppearance['variant']>
type Size = NonNullable<ButtonAppearance['size']>

const DEFAULT_SIZES: Record<Variant, Size> = { solid: 'md', soft: 'sm' }

/** Every glyph a button draws, and the spinner that takes the leading one's place. */
const ICON_SIZE = 13

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> &
  ButtonAppearance & {
    /** A glyph before the label. */
    icon?: IconComponent
    /** Drops input and dims the button. It stays focusable, so a tooltip can say why. */
    isDisabled?: boolean
    /** Drops input and swaps the leading glyph (or, with none, adds one) for a spinner. */
    isLoading?: boolean
    /** The label while loading ("Retrying…"), when it should say so. */
    loadingLabel?: ReactNode
  }

/**
 * A text button. Extra props (aria-*, a Tooltip's handlers) pass straight to
 * the `<button>`, which is `type="button"` unless told otherwise.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'soft',
    tone,
    size,
    icon: Icon,
    isDisabled,
    isLoading,
    loadingLabel,
    className,
    type = 'button',
    onClick,
    children,
    ...buttonProps
  },
  ref,
) {
  const label = isLoading && loadingLabel != null ? loadingLabel : children
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonVariants({
          variant,
          tone: variant === 'solid' ? (tone ?? 'accent') : undefined,
          size: size ?? DEFAULT_SIZES[variant],
        }),
        className,
      )}
      {...pressableProps({ isDisabled, isLoading, onClick })}
      {...buttonProps}
    >
      {isLoading ? <ButtonSpinner size={ICON_SIZE} /> : Icon && <Icon size={ICON_SIZE} />}
      {label}
    </button>
  )
})
