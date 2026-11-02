import { createContext, forwardRef, useContext, useId, type HTMLAttributes, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { cn } from '../foundations/cn'

// The id a CardHeader gives its title, so a `section` card is named by it.
const CardTitleContext = createContext<string | undefined>(undefined)

interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * `section` is named by its CardHeader's title, so give it one.
   * `div` or `li` for a card with no header, such as a card in a list.
   */
  as?: 'section' | 'div' | 'li'
  /**
   * The whole card opens something: it lifts on hover and presses in. Give it a
   * StretchedLink for the action. Its contents can react with `group-hover/card:`.
   */
  isInteractive?: boolean
  /** Its place in a layout. */
  className?: string
  /** A CardHeader, a CardBody and an optional CardFooter, or your own content. */
  children?: ReactNode
}

// Hover sets box-shadow directly rather than through `shadow-raised`: that
// composes a five-layer shadow list, which would cross-fade from the card's
// shadow instead of morphing into it.
const cardVariants = cva('surface overflow-hidden contain-content', {
  variants: {
    isInteractive: {
      true: [
        'group/card relative cursor-pointer',
        'transition-[box-shadow,transform] duration-(--duration-fast) ease-in-out',
        'hover:[box-shadow:var(--shadow-raised)] active:transform-[translateY(1px)]',
      ],
    },
  },
})

/**
 * The panel surface, clipped to its rounded corners. Build it from a
 * CardHeader, a CardBody and an optional CardFooter, or lay out your own
 * content in an element of your own inside it.
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Element = 'section', isInteractive = false, className, ...props },
  ref,
) {
  const titleId = useId()
  return (
    <CardTitleContext.Provider value={titleId}>
      <Element
        // One ref type for the three elements it can be.
        ref={ref as never}
        className={cn(cardVariants({ isInteractive }), className)}
        aria-labelledby={Element === 'section' ? titleId : undefined}
        {...props}
      />
    </CardTitleContext.Provider>
  )
})

interface CardListProps extends Omit<HTMLAttributes<HTMLUListElement>, 'aria-label'> {
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

interface CardHeaderProps {
  /** Names the card: a `section` card is labelled by it. */
  title: string
  /** A 16px icon before the title. */
  icon?: ReactNode
  /** Controls or a badge at the end of the row. */
  actions?: ReactNode
}

/** The card's 44px title row: an icon, the title and its actions. */
export function CardHeader({ title, icon, actions }: CardHeaderProps): JSX.Element {
  const titleId = useContext(CardTitleContext)
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
      {actions != null && <div className="flex shrink-0 items-center">{actions}</div>}
    </div>
  )
}

// The body's padding, by what it holds. Rows that carry their own vertical
// padding stack with none above them, and just enough below to clear a footer.
const bodyVariants = cva(null, {
  variants: {
    layout: {
      default: 'px-(--card-body-padding) pt-4 pb-(--card-body-padding)',
      rows: 'flex flex-col px-(--card-body-padding) pb-(--card-body-padding) has-[+[data-card-footer]]:pb-12',
      flush: 'pt-4 pb-(--card-body-padding)',
    },
  },
  defaultVariants: { layout: 'default' },
})

interface CardBodyProps {
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

interface CardFooterProps {
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
