import { useId, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { DataList } from '@/components/DataRow'

// A section card's parts. Views that build a card by hand use the exported ones,
// merged with their own classes through `cn()`. The `ui-section*` classes are
// markers views target (`[&_.ui-section-footer]:pt-12`).

/** The card: the panel surface, clipped to its rounded corners. */
export const SECTION_CARD = 'ui-section surface overflow-hidden contain-content'

/** The title row, at a fixed height so a header with a button is no taller than one without. */
export const SECTION_HEADER = cx(
  'ui-section-header flex items-center justify-between gap-12',
  'h-(--section-header-height) px-(--section-header-padding-x)',
)

/** The body. A little top padding gives the content a touch more room below the title than above it. */
export const SECTION_BODY = 'ui-section-body px-(--section-body-padding) pt-4 pb-(--section-body-padding)'

// A sunken band below the body, flush to the card edges: a footnote or status
// area rather than part of the readout.
const FOOTER = 'ui-section-footer border-t border-t-line bg-inset px-(--section-body-padding) py-8'

interface SectionProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  /**
   * What the body holds: plain content (`div`, the default) or label/value
   * pairs (`dl`, each child a `DataRow`). Only the element changes; the look
   * stays the same.
   */
  bodyAs?: 'div' | 'dl'
}

function SectionBody({
  as,
  className,
  children,
}: {
  as: NonNullable<SectionProps['bodyAs']>
  className: string
  children: ReactNode
}): JSX.Element {
  if (as === 'dl') return <DataList className={className}>{children}</DataList>
  return <div className={className}>{children}</div>
}

export function Section({
  title,
  icon,
  action,
  children,
  footer,
  className,
  bodyClassName,
  bodyAs = 'div',
}: SectionProps): JSX.Element {
  const titleId = useId()
  return (
    <section className={cn(SECTION_CARD, className)} aria-labelledby={titleId}>
      <div className={SECTION_HEADER}>
        <div className="ui-section-heading flex min-w-0 items-center gap-8">
          {icon != null && (
            <span className="ui-section-icon inline-flex shrink-0 items-center justify-center text-tertiary" aria-hidden>
              {icon}
            </span>
          )}
          <h2 id={titleId} className="section-title">
            {title}
          </h2>
        </div>
        {action != null && <div className="ui-section-action flex shrink-0 items-center">{action}</div>}
      </div>
      <SectionBody as={bodyAs} className={cn(SECTION_BODY, bodyClassName)}>
        {children}
      </SectionBody>
      {footer != null && <div className={FOOTER}>{footer}</div>}
    </section>
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
        'ui-section-badge shrink-0 rounded-full px-6 py-px',
        'text-2xs font-semibold uppercase tracking-[0.04em] text-warning',
        'bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)]',
      )}
    >
      {children}
    </span>
  )
}
