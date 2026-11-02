import { createContext, forwardRef, useContext, useId, type HTMLAttributes, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { cn } from '../foundations/cn'
import { ChevronRightIcon } from '../icons/Icons'
import { StretchedLink } from '../link/StretchedLink'

interface CardContextValue {
  /** The id a CardHeader gives its title, so a `section` card is named by it. */
  titleId?: string
  /** The card opens something, so its CardHeader ends in a caret. */
  isOpenable: boolean
}

const CardContext = createContext<CardContextValue>({ isOpenable: false })

type CardProps = Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & {
  /**
   * `section` is named by its CardHeader's title, so give it one.
   * `div` or `li` for a card with no header, such as a card in a list.
   */
  as?: 'section' | 'div' | 'li'
  /** Opens the view the card summarises: the whole card is its link, and its header ends in a caret. */
  onOpen?: () => void
  /**
   * What a screen reader says for the card's link, which has no visible text,
   * when its CardHeader's title isn't enough: what the card shows, then where
   * it goes ("Usage: 3.2 GB today. Open Usage."). A card with no CardHeader needs it.
   */
  linkLabel?: string
  /** Its place in a layout: a width (`max-w-[320px]`) or a grid span (`col-span-2`). */
  className?: string
  /** A CardHeader, a CardBody and an optional CardFooter, or your own content. */
  children?: ReactNode
}

// An openable card lifts on hover and presses in, and its body fills its
// height. Hover sets box-shadow directly rather than through `shadow-raised`:
// that composes a five-layer shadow list, which would cross-fade from the
// card's shadow instead of morphing into it.
const cardVariants = cva('surface overflow-hidden contain-content', {
  variants: {
    isOpenable: {
      true: [
        'group/card relative flex flex-col cursor-pointer',
        'transition-[box-shadow,transform] duration-(--duration-fast) ease-in-out',
        'hover:[box-shadow:var(--shadow-raised)] active:transform-[translateY(1px)]',
      ],
    },
  },
})

/**
 * The panel surface, clipped to its rounded corners. Build it from a
 * CardHeader, a CardBody and an optional CardFooter, or lay out your own
 * content in an element of your own inside it. With `onOpen` the whole card
 * is a link; a control inside it raises itself above the link (`relative z-2`).
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Element = 'section', onOpen, linkLabel, className, children, ...props },
  ref,
) {
  const titleId = useId()
  const isOpenable = onOpen != null
  return (
    <CardContext.Provider value={{ titleId, isOpenable }}>
      <Element
        // One ref type for the three elements it can be.
        ref={ref as never}
        className={cn(cardVariants({ isOpenable }), className)}
        aria-labelledby={Element === 'section' ? titleId : undefined}
        data-openable={isOpenable ? '' : undefined}
        {...props}
      >
        {/* First, so it comes before the card's own controls in tab order. */}
        {/* Named by the CardHeader's title, unless linkLabel says more. */}
        {isOpenable && (
          <StretchedLink
            label={linkLabel}
            aria-labelledby={linkLabel == null ? titleId : undefined}
            onClick={onOpen}
          />
        )}
        {children}
      </Element>
    </CardContext.Provider>
  )
})

/**
 * Moves focus to the link of the openable card holding `element`: for a
 * control in it that's about to unmount, so focus stays in the card instead
 * of falling back to the page.
 */
export function focusCardLink(element: HTMLElement): void {
  element.closest('[data-openable]')?.querySelector<HTMLElement>(':scope > [data-stretched-link]')?.focus()
}

type CardListProps = Omit<HTMLAttributes<HTMLUListElement>, 'aria-label' | 'children'> & {
  /** Names the list. */
  label: string
  /** The rows, as `<li>`s. They own their padding, so the hairlines run edge to edge. */
  children?: ReactNode
}

/** A list that is one card, with a hairline between its rows. */
export const CardList = forwardRef<HTMLUListElement, CardListProps>(function CardList(
  { label, className, ...props },
  ref,
) {
  return (
    <ul
      ref={ref}
      // Safari drops a list's role when its markers are styled away.
      role="list"
      aria-label={label}
      className={cn('surface divide-y divide-line overflow-hidden contain-content', className)}
      {...props}
    />
  )
})

// A fixed height, so a header with a button is no taller than one without.
const HEADER = cx(
  'flex items-center justify-between gap-12',
  'h-(--card-header-height) px-(--card-header-padding-x)',
)

// The openable card's caret: always shown, brightening while the card is
// hovered or its link has keyboard focus.
const CARET = cx(
  'shrink-0 text-tertiary transition-[color] duration-(--duration-fast) ease-in-out',
  'group-hover/card:text-secondary group-has-[[data-stretched-link]:focus-visible]/card:text-secondary',
)

type CardHeaderProps = {
  /** Names the card: a `section` card is labelled by it. */
  title: string
  /** A 16px icon before the title. */
  icon?: ReactNode
  /** Controls or a badge at the end of the row. */
  actions?: ReactNode
}

/** The card's 44px title row: an icon, the title and its actions, then a caret when the card opens something. */
export function CardHeader({ title, icon, actions }: CardHeaderProps): JSX.Element {
  const { titleId, isOpenable } = useContext(CardContext)
  return (
    <div className={HEADER}>
      <div className="flex min-w-0 items-center gap-8">
        {icon != null && (
          <span className="inline-flex shrink-0 items-center justify-center text-tertiary" aria-hidden>
            {icon}
          </span>
        )}
        <h2 id={titleId} className="text-heading-small">
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

// The body's padding, by what it holds. Rows that carry their own vertical
// padding stack with none above them, and just enough below to clear a footer.
// It grows to fill an openable card, so content can sit at its foot.
const bodyVariants = cva('grow', {
  variants: {
    layout: {
      default: 'px-(--card-body-padding) pt-4 pb-(--card-body-padding)',
      rows: 'flex flex-col px-(--card-body-padding) pb-(--card-body-padding) has-[+[data-card-footer]]:pb-12',
      flush: 'pt-4 pb-(--card-body-padding)',
    },
  },
  defaultVariants: { layout: 'default' },
})

type CardBodyProps = {
  /**
   * `default` pads all round. `rows` for rows that carry their own vertical
   * padding (settings, list rows): no top padding. `flush` for a
   * DataListStack, whose hairlines run to the card's sides.
   */
  layout?: VariantOf<typeof bodyVariants, 'layout'>
  /** The content. */
  children: ReactNode
}

/** The padded body. A little top padding gives the content more room below the title than above it. */
export function CardBody({ layout = 'default', children }: CardBodyProps): JSX.Element {
  return <div className={bodyVariants({ layout })}>{children}</div>
}

type CardFooterProps = {
  /** The footnote or status. */
  children: ReactNode
}

/** A sunken band below the body, flush to the card's edges: a footnote or status. */
export function CardFooter({ children }: CardFooterProps): JSX.Element {
  return (
    <div className="bg-inset px-(--card-body-padding) py-12" data-card-footer="">
      {children}
    </div>
  )
}
