import { cx } from 'class-variance-authority'
import { type ComponentProps, type ReactNode, use } from 'react'

import { ChevronRightIcon } from '../icons/Icons'
import { cn } from '../utils/cn'
import { CardContext } from './card-context'

// A fixed height, so a header with a button is no taller than one without.
const HEADER = cx('flex items-center justify-between gap-12', 'h-(--card-header-height) px-(--card-header-padding-x)')

// The openable card's caret: always shown, brightening while the card is
// hovered or its link has keyboard focus.
const CARET = cx(
  'shrink-0 text-tertiary transition-[color] duration-(--duration-fast) ease-in-out',
  'group-hover/card:text-secondary group-has-[[data-stretched-link]:focus-visible]/card:text-secondary',
)

type CardHeaderProps = Omit<ComponentProps<'div'>, 'title' | 'children'> & {
  /** Names the card: a `section` card is labelled by it. */
  title: string
  /** A 16px icon before the title. */
  icon?: ReactNode
  /** Controls or a badge at the end of the row. */
  actions?: ReactNode
}

/** The card's 44px title row: an icon, the title and its actions, then a caret when the card opens something. */
export function CardHeader({ title, icon, actions, className, ...props }: CardHeaderProps) {
  const { titleId, isOpenable } = use(CardContext)
  return (
    <div className={cn(HEADER, className)} {...props}>
      <div className="flex min-w-0 items-center gap-8">
        {icon != null && (
          <span className="inline-flex shrink-0 text-tertiary" aria-hidden>
            {icon}
          </span>
        )}
        {/* Down 0.75px: Urbanist's letters sit high in their line, so a centred
            title read above the icon. A title is mostly lowercase, so this
            centres the icon between its capitals and its x-height, where the
            eye puts the word's middle; 1.5px, the capitals alone, left the
            icon reading high. */}
        <h2 id={titleId} className="type-heading translate-y-[0.75px] text-primary">
          {title}
        </h2>
      </div>
      {(actions != null || isOpenable) && (
        <div className="flex shrink-0 items-center gap-8">
          {/* Raised above an openable card's link, so they take their own clicks. */}
          {actions != null && <div className={cx('flex items-center', isOpenable && 'relative z-2')}>{actions}</div>}
          {isOpenable && <ChevronRightIcon size={16} className={CARET} />}
        </div>
      )}
    </div>
  )
}
