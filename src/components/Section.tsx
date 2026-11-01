import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { cn } from '@/lib/cn'

// The title row, at a fixed height so a header with a button is no taller than one without.
const HEADER = cx(
  'flex items-center justify-between gap-12',
  'h-(--section-header-height) px-(--section-header-padding-x)',
)

// The body. A little top padding gives the content a touch more room below the title than above it.
const BODY = 'px-(--section-body-padding) pt-4 pb-(--section-body-padding)'

// A sunken band below the body, flush to the card edges: a footnote or status
// area rather than part of the readout.
const FOOTER = 'border-t border-t-line bg-inset px-(--section-body-padding) py-8'

interface SectionCardProps extends HTMLAttributes<HTMLElement> {
  /** The element: `li` for a card in a list. */
  as?: 'div' | 'li' | 'section'
}

/**
 * The card on its own: the panel surface, clipped to its rounded corners, with
 * no header or padding. For a card that lays out its own content, such as a
 * list whose rows run edge to edge.
 */
export function SectionCard({ as: Element = 'div', className, ...props }: SectionCardProps): JSX.Element {
  return <Element className={cn('surface overflow-hidden contain-content', className)} {...props} />
}

interface SectionProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  footerClassName?: string
}

/** A card with a title row, a padded body and an optional footer band. */
export function Section({
  title,
  icon,
  action,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
}: SectionProps): JSX.Element {
  const titleId = useId()
  return (
    <SectionCard as="section" className={className} aria-labelledby={titleId}>
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
        {action != null && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      <div className={cn(BODY, bodyClassName)}>{children}</div>
      {footer != null && <div className={cn(FOOTER, footerClassName)}>{footer}</div>}
    </SectionCard>
  )
}

/**
 * A small amber pill for a section's action slot: "heads up" without the alarm
 * of an error colour. The ISP card's VPN flag.
 */
export function SectionBadge({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span
      className={cx(
        'shrink-0 rounded-full px-6 py-px',
        'text-2xs font-semibold uppercase tracking-[0.04em] text-warning',
        'bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)]',
      )}
    >
      {children}
    </span>
  )
}
