import { cx } from 'class-variance-authority'
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react'

import { ArrowUpRightIcon, ChevronRightIcon, type IconComponent } from '../icons/Icons'
import { cn } from '../utils/cn'
import { pressableProps, STATE_CLASSES } from '../utils/pressable'

// Focus shows the way hover does (accent and underline), not with a ring. The
// pill's padding hangs outside the text (with the icons' empty edges), so the
// words line up with the text around them and the link adds no height to its line.
const LINK = cx(
  'group/link inline-flex items-center gap-[5px] rounded-full px-8 py-2 -my-2 ml-[-9.5px] mr-[-9px]',
  'text-[length:inherit] leading-[inherit] font-medium whitespace-nowrap text-secondary no-underline',
  'transition-[color] duration-(--duration-fast) ease-in-out',
  'usable:hover:text-accent-text focus-visible:text-accent-text focus-visible:outline-none',
  STATE_CLASSES,
)

// The icons take the link's own (animating) colour, a touch dimmer at rest
// through opacity, so there's one colour animation rather than two that drift.
// Flex centring sets them on the line box, which keeps descender room the label
// doesn't use, so 1px up centres them on the text as Figma draws it (as
// ServiceTally's arrows).
const ICON = cx(
  'translate-y-[-1px] opacity-72 transition-opacity duration-(--duration-fast) ease-in-out',
  'group-usable/link:group-hover/link:opacity-100 group-focus-visible/link:opacity-100',
)

// Only the label underlines, not the icons. It carries the link's baseline:
// without it the first icon's bottom edge is the baseline, and the line the
// link sits in grows by a descender.
const LABEL = cx(
  'self-baseline',
  'group-usable/link:group-hover/link:underline group-usable/link:group-hover/link:underline-offset-2',
  'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
)

const ICON_SIZE = 13

type SharedProps = {
  /** The label. */
  children: ReactNode
  /** An icon before the label. */
  icon?: IconComponent
}

type ViewProps = SharedProps &
  Omit<ComponentProps<'button'>, 'disabled' | 'type' | 'onClick'> & {
    href?: never
    /** Drops input and dims the link. It stays focusable, so a tooltip can say why. */
    isDisabled?: boolean
    /** Opens the view. Not called while disabled. */
    onClick?: MouseEventHandler<HTMLButtonElement>
  }

type AddressProps = SharedProps &
  Omit<ComponentProps<'a'>, 'target' | 'rel'> & {
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
export function Link(props: LinkProps) {
  if (props.href !== undefined) {
    const { icon: Icon, className, children, ...anchorProps } = props
    return (
      <a className={cn(LINK, className)} target="_blank" rel="noreferrer" {...anchorProps}>
        {Icon && <Icon size={ICON_SIZE} className={ICON} />}
        <span className={LABEL}>{children}</span>
        <span className="sr-only"> (opens in a new window)</span>
        <ArrowUpRightIcon size={ICON_SIZE} className={cx(ICON, '-mx-[3px]')} />
      </a>
    )
  }
  const { icon: Icon, isDisabled = false, className, onClick, children, ...buttonProps } = props
  return (
    <button
      type="button"
      // It moves to another view rather than acting, like StretchedLink and a card's link.
      role="link"
      className={cn(LINK, className)}
      {...pressableProps({ isDisabled, onClick })}
      {...buttonProps}
    >
      {Icon && <Icon size={ICON_SIZE} className={ICON} />}
      <span className={LABEL}>{children}</span>
      <ChevronRightIcon size={ICON_SIZE} className={cx(ICON, '-mx-4')} />
    </button>
  )
}
