import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { cn } from '../foundations/cn'
import { ChevronRightIcon, type IconComponent } from '../icons/Icons'
import { STATE_CLASSES, pressableProps } from '../foundations/pressable'

// Muted at rest and the accent on hover. Focus shows the way hover does
// (accent and underline), not with a ring. The pill's padding hangs outside
// the text (with the glyphs' empty edges), so the words line up with the text
// around them.
const VIEW_LINK = cx(
  'group/link inline-flex items-center gap-[5px] rounded-full px-8 py-2 ml-[-9.5px] mr-[-9px]',
  'text-[length:inherit] font-medium whitespace-nowrap text-secondary',
  'transition-[color] duration-(--duration-fast) ease-in-out',
  'hover:text-accent focus-visible:text-accent focus-visible:outline-none',
  STATE_CLASSES,
)

// The glyphs take the link's own (animating) colour, a touch dimmer at rest
// through opacity, so there's one colour animation rather than two that drift.
const GLYPH = cx(
  'opacity-72 transition-opacity duration-(--duration-fast) ease-in-out',
  'group-hover/link:opacity-100 group-focus-visible/link:opacity-100',
)

// Only the label underlines, not the glyphs.
const LABEL = cx(
  'group-hover/link:underline group-hover/link:underline-offset-2',
  'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
)

const ICON_SIZE = 13

type ViewLinkProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'type'> & {
  children: ReactNode
  /** A glyph before the label. */
  icon?: IconComponent
  /** Drops input and dims the link. It stays focusable, so a tooltip can say why. */
  isDisabled?: boolean
}

/**
 * A link to another view in the app (All results, View timeline), at the size
 * of the text it sits in. It always ends in a caret. For a real address, use
 * `<Link>`.
 */
export const ViewLink = forwardRef<HTMLButtonElement, ViewLinkProps>(function ViewLink(
  { icon: Icon, isDisabled, className, onClick, children, ...buttonProps },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(VIEW_LINK, className)}
      {...pressableProps({ isDisabled, onClick })}
      {...buttonProps}
    >
      {Icon && <Icon size={ICON_SIZE} className={GLYPH} />}
      <span className={LABEL}>{children}</span>
      <ChevronRightIcon size={ICON_SIZE} className={cx(GLYPH, '-mx-4')} />
    </button>
  )
})
