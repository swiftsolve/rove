import { cva } from 'class-variance-authority'
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react'

import { cn } from '../foundations/cn'
import { PRESS, pressableProps, STATE_CLASSES } from '../foundations/pressable'
import type { IconComponent } from '../icons/Icons'
import { ButtonSpinner } from '../spinner/ButtonSpinner'

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
        soft: null,
      },
      tone: { neutral: null, accent: null, negative: null },
      size: {
        sm: 'gap-6 px-10 py-6 type-label-small',
        md: 'gap-6 px-(--card-padding) py-10 type-label-large',
      },
    },
    compoundVariants: [
      {
        variant: 'soft',
        tone: 'neutral',
        class: 'bg-inset text-secondary usable:hover:bg-hover usable:hover:text-primary',
      },
      {
        variant: 'soft',
        tone: 'negative',
        class:
          'bg-status-negative/(--opacity-tint-md) text-negative usable:hover:bg-status-negative/(--opacity-tint-lg)',
      },
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
 * What a button looks like. A solid one is the accent, or negative to stop
 * something; a soft one is neutral, or negative on a red surface (an error
 * Banner). A solid defaults to `md`, a soft one to `sm`.
 */
export type ButtonAppearance =
  | {
      /** `solid` for a page's main action, or stopping it; `soft` for everything else. */
      variant: 'solid'
      /**
       * Solid: `accent` or `negative`. Soft: `neutral`, or `negative` on a red surface.
       * @default accent (solid), neutral (soft)
       */
      tone?: 'accent' | 'negative'
      /**
       * `md`, or the more compact `sm`.
       * @default md (solid), sm (soft)
       */
      size?: 'sm' | 'md'
    }
  | {
      /** `solid` for a page's main action, or stopping it; `soft` for everything else. */
      variant?: 'soft'
      /** Solid: `accent` or `negative`. Soft: `neutral`, or `negative` on a red surface. */
      tone?: 'neutral' | 'negative'
      /** `md`, or the more compact `sm`. */
      size?: 'sm' | 'md'
    }

type Variant = NonNullable<ButtonAppearance['variant']>
type Tone = NonNullable<ButtonAppearance['tone']>
type Size = NonNullable<ButtonAppearance['size']>

/**
 * The tones each variant has, its default first. Any other tone (Storybook's
 * controls can pick one the types forbid) falls back to the default.
 */
const TONES: Record<Variant, Tone[]> = { solid: ['accent', 'negative'], soft: ['neutral', 'negative'] }
const DEFAULT_SIZES: Record<Variant, Size> = { solid: 'md', soft: 'sm' }

/** Every icon a button draws, and the spinner that takes the leading one's place. */
const ICON_SIZE = 13

export type ButtonProps = Omit<ComponentProps<'button'>, 'disabled' | 'children' | 'onClick'> &
  ButtonAppearance & {
    /** The label. */
    children?: ReactNode
    /** Runs the action. Not called while disabled or loading. */
    onClick?: MouseEventHandler<HTMLButtonElement>
    /** An icon before the label. */
    icon?: IconComponent
    /** Drops input and dims the button. It stays focusable, so a tooltip can say why. */
    isDisabled?: boolean
    /** Drops input and swaps the leading icon (or, with none, adds one) for a spinner. */
    isLoading?: boolean
    /** The label while loading ("Retrying…"), when it should say so. */
    loadingLabel?: ReactNode
  }

/**
 * A text button. Extra props (aria-*, a Tooltip's handlers) pass straight to
 * the `<button>`, which is `type="button"` unless told otherwise.
 */
export function Button({
  variant = 'soft',
  tone,
  size,
  icon: Icon,
  isDisabled = false,
  isLoading = false,
  loadingLabel,
  className,
  type = 'button',
  onClick,
  children,
  ...buttonProps
}: ButtonProps) {
  const label = isLoading && loadingLabel != null ? loadingLabel : children
  const variantTones = TONES[variant]
  const resolvedTone = tone && variantTones.includes(tone) ? tone : variantTones[0]
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, tone: resolvedTone, size: size ?? DEFAULT_SIZES[variant] }), className)}
      {...pressableProps({ isDisabled, isLoading, onClick })}
      {...buttonProps}
    >
      {isLoading ? <ButtonSpinner size={ICON_SIZE} /> : Icon && <Icon size={ICON_SIZE} />}
      {label}
    </button>
  )
}
