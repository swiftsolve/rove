import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from 'class-variance-authority'
import { cn } from '../foundations/cn'
import { ArrowUpRightIcon, ChevronRightIcon, type IconComponent } from '../icons/Icons'
import { STATE_CLASSES, pressableProps } from '../foundations/pressable'

// Muted at rest and the accent on hover, unless disabled. Focus shows the way hover does
// (accent and underline), not with a ring. The pill's padding hangs outside
// the text (with the icons' empty edges), so the words line up with the text
// around them.
const LINK = cx(
  'group/link inline-flex items-center gap-[5px] rounded-full px-8 py-2 ml-[-9.5px] mr-[-9px]',
  'text-[length:inherit] font-medium whitespace-nowrap text-secondary no-underline',
  'transition-[color] duration-(--duration-fast) ease-in-out',
  'usable:hover:text-accent-text focus-visible:text-accent-text focus-visible:outline-none',
  STATE_CLASSES,
)

// The icons take the link's own (animating) colour, a touch dimmer at rest
// through opacity, so there's one colour animation rather than two that drift.
const ICON = cx(
  'opacity-72 transition-opacity duration-(--duration-fast) ease-in-out',
  'group-usable/link:group-hover/link:opacity-100 group-focus-visible/link:opacity-100',
)

// Only the label underlines, not the icons.
const LABEL = cx(
  'group-usable/link:group-hover/link:underline group-usable/link:group-hover/link:underline-offset-2',
  'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
)

const ICON_SIZE = 13

type SharedProps = {
  children: ReactNode
  /** An icon before the label. */
  icon?: IconComponent
}

type ViewProps = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'type'> & {
    href?: never
    /** Drops input and dims the link. It stays focusable, so a tooltip can say why. */
    isDisabled?: boolean
  }

type AddressProps = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> & {
    /** A real address, opened in a new window. */
    href: string
  }

type LinkProps = ViewProps | AddressProps

/**
 * A link at the size of the text it sits in. With `onClick` it opens another
 * view in the app (All results, View timeline) and ends in a caret; with
 * `href` it opens a real address in a new window, ends in an arrow, and says
 * so to a screen reader.
 */
export const Link = forwardRef<HTMLButtonElement | HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  if (props.href !== undefined) {
    const { icon: Icon, className, children, ...anchorProps } = props
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={cn(LINK, className)}
        target="_blank"
        rel="noreferrer"
        {...anchorProps}
      >
        {Icon && <Icon size={ICON_SIZE} className={ICON} />}
        <span className={LABEL}>{children}</span>
        <span className="sr-only"> (opens in a new window)</span>
        <ArrowUpRightIcon size={ICON_SIZE} className={cx(ICON, '-mx-[3px]')} />
      </a>
    )
  }
  const { icon: Icon, isDisabled, className, onClick, children, ...buttonProps } = props
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={cn(LINK, className)}
      {...pressableProps({ isDisabled, onClick })}
      {...buttonProps}
    >
      {Icon && <Icon size={ICON_SIZE} className={ICON} />}
      <span className={LABEL}>{children}</span>
      <ChevronRightIcon size={ICON_SIZE} className={cx(ICON, '-mx-4')} />
    </button>
  )
})
