import { createContext, forwardRef, useContext, useId, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { cn } from '../foundations/cn'

// The id a CardHeader gives its title, so a `section` card is named by it.
const CardTitleContext = createContext<string | undefined>(undefined)

interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * `section` (the default) is named by its CardHeader's title, so give it one.
   * `div`, `li` or `ul` for a card with no header: a list's rows, a card in a
   * list, or a list that is one card.
   */
  as?: 'section' | 'div' | 'li' | 'ul'
  /** False for a card whose content pops out of it, such as a row's menu. */
  shouldClip?: boolean
  /** A hairline between each of its children: a list that is one card. */
  isDivided?: boolean
}

/**
 * The panel surface, clipped to its rounded corners. Build it from a
 * CardHeader, a CardBody and an optional CardFooter, or lay out your own
 * content in it.
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Element = 'section', shouldClip = true, isDivided = false, className, ...props },
  ref,
) {
  const titleId = useId()
  return (
    <CardTitleContext.Provider value={titleId}>
      <Element
        // One ref type for the four elements it can be.
        ref={ref as never}
        className={cn(
          'surface',
          shouldClip && 'overflow-hidden contain-content',
          isDivided && '[&>*+*]:border-t [&>*+*]:border-t-line',
          className,
        )}
        aria-labelledby={Element === 'section' ? titleId : undefined}
        {...props}
      />
    </CardTitleContext.Provider>
  )
})

// A fixed height, so a header with a button is no taller than one without.
const HEADER = cx(
  'flex items-center justify-between gap-12',
  'h-(--card-header-height) px-(--card-header-padding-x)',
)

interface CardHeaderProps {
  title: string
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

interface CardPartProps {
  className?: string
  children: ReactNode
}

/** The padded body. A little top padding gives the content more room below the title than above it. */
export function CardBody({ className, children }: CardPartProps): JSX.Element {
  return (
    <div className={cn('px-(--card-body-padding) pt-4 pb-(--card-body-padding)', className)}>{children}</div>
  )
}

/** A sunken band below the body, flush to the card's edges: a footnote or status. */
export function CardFooter({ className, children }: CardPartProps): JSX.Element {
  return (
    <div className={cn('border-t border-t-line bg-inset px-(--card-body-padding) py-8', className)}>
      {children}
    </div>
  )
}
