import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { cn } from '../../foundations/cn'
import { ButtonSpinner } from '../spinner/ButtonSpinner'
import type { IconComponent } from '../../icons/Icons'
import { PRESS, STATE_CLASSES, pressableProps } from './pressable'

// The quiet text link's glyphs: the link's own (animating) colour, a touch
// dimmer at rest through opacity, so there's one colour animation rather than
// two that drift apart.
const LINK_GLYPH = cx(
  'opacity-72 transition-opacity duration-(--duration-fast) ease-in-out',
  'group-hover/link:opacity-100 group-focus-visible/link:opacity-100',
)

// Only a link's label underlines, not its glyphs.
const LINK_LABEL = cx(
  'group-hover/link:underline group-hover/link:underline-offset-2',
  'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
)

const buttonVariants = cva(['inline-flex items-center justify-center', STATE_CLASSES], {
  variants: {
    variant: {
      /** A solid fill under a white label: a page's main action, or stopping it. */
      solid: ['rounded-sm text-on-fill', PRESS],
      /** A quiet tinted chip: everything else. */
      soft: ['rounded-sm', PRESS],
      /** No fill until hovered: a secondary choice beside a soft one (Dismiss). */
      ghost: ['rounded-sm', PRESS],
      /**
       * A text link with glyphs, muted at rest and the accent on hover. Focus
       * shows the way hover does (accent and underline), not with a ring.
       */
      link: [
        'group/link rounded-full font-medium text-secondary',
        'hover:text-accent focus-visible:text-accent focus-visible:outline-none',
      ],
    },
    tone: { accent: null, neutral: null, negative: null },
    // Each variant sizes itself (below): a link's `sm` is not a chip's.
    size: { sm: null, md: null, inherit: null },
  },
  compoundVariants: [
    {
      variant: ['solid', 'soft', 'ghost'],
      class: 'transition-[color,background,transform] duration-(--duration-fast) ease-in-out',
    },
    { variant: ['solid', 'soft', 'ghost'], size: 'sm', class: 'gap-6 px-12 py-6 text-xs font-medium' },
    {
      variant: ['solid', 'soft', 'ghost'],
      size: 'md',
      class: 'gap-6 px-(--card-padding) py-10 text-sm font-semibold tracking-label-large',
    },
    { variant: 'link', class: 'transition-[color] duration-(--duration-fast) ease-in-out' },
    // A link in a line of text, at its size. The pill's padding hangs outside
    // the text (with the glyphs' empty edges), so it lines up with the words
    // around it.
    { variant: 'link', size: 'inherit', class: 'gap-[5px] px-8 py-2 ml-[-9.5px] mr-[-9px] text-[length:inherit]' },
    // A link on its own line, in small text: no pill to hang out.
    { variant: 'link', size: 'sm', class: 'gap-6 text-xs whitespace-nowrap' },
    { variant: 'solid', tone: 'accent', class: 'bg-accent-fill usable:hover:bg-accent-fill-hover' },
    { variant: 'solid', tone: 'negative', class: 'bg-status-negative-fill usable:hover:bg-status-negative-fill-hover' },
    {
      variant: 'soft',
      tone: 'neutral',
      class: 'bg-inset text-secondary usable:hover:bg-hover usable:hover:text-primary',
    },
    {
      variant: 'soft',
      tone: 'negative',
      class: 'bg-status-negative/(--opacity-tint-md) text-negative usable:hover:bg-status-negative/(--opacity-tint-lg)',
    },
    { variant: 'ghost', tone: 'neutral', class: 'text-secondary usable:hover:bg-hover usable:hover:text-primary' },
    {
      variant: 'ghost',
      tone: 'negative',
      class: 'text-secondary usable:hover:bg-status-negative/(--opacity-tint-md) usable:hover:text-primary',
    },
  ],
})

/**
 * What a button looks like. Each variant takes only the tones and sizes the
 * design has for it, and defaults to its usual pair: a solid is the accent at
 * `md`, soft and ghost are neutral at `sm`, a link inherits its line's size.
 */
export type ButtonAppearance =
  | { variant: 'solid'; tone?: 'accent' | 'negative'; size?: 'sm' | 'md' }
  | { variant?: 'soft'; tone?: 'neutral' | 'negative'; size?: 'sm' | 'md' }
  | { variant: 'ghost'; tone?: 'neutral' | 'negative'; size?: 'sm' | 'md' }
  | { variant: 'link'; tone?: 'neutral'; size?: 'inherit' | 'sm' }

type Variant = NonNullable<ButtonAppearance['variant']>
type Tone = NonNullable<ButtonAppearance['tone']>
type Size = NonNullable<ButtonAppearance['size']>

const DEFAULTS: Record<Variant, { tone: Tone; size: Size }> = {
  solid: { tone: 'accent', size: 'md' },
  soft: { tone: 'neutral', size: 'sm' },
  ghost: { tone: 'neutral', size: 'sm' },
  link: { tone: 'neutral', size: 'inherit' },
}

/** Every glyph a button draws, and the spinner that takes the leading one's place. */
const ICON_SIZE = 13

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> &
  ButtonAppearance & {
    /** A glyph before the label. */
    icon?: IconComponent
    /** A glyph after the label: a link's caret. */
    iconEnd?: IconComponent
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
    iconEnd: IconEnd,
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
  const isLink = variant === 'link'
  const glyphClassName = isLink ? LINK_GLYPH : undefined
  const label = isLoading && loadingLabel != null ? loadingLabel : children
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        buttonVariants({
          variant,
          tone: tone ?? DEFAULTS[variant].tone,
          size: size ?? DEFAULTS[variant].size,
        }),
        className,
      )}
      {...pressableProps({ isDisabled, isLoading, onClick })}
      {...buttonProps}
    >
      {isLoading ? (
        <ButtonSpinner size={ICON_SIZE} />
      ) : (
        Icon && <Icon size={ICON_SIZE} className={glyphClassName} />
      )}
      {isLink ? <span className={LINK_LABEL}>{label}</span> : label}
      {IconEnd && <IconEnd size={ICON_SIZE} className={cx(glyphClassName, isLink && '-mx-4')} />}
    </button>
  )
})
