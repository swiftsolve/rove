import { useId, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { Card, ChevronRightIcon, DirectionIcon, cn } from '@/ui'

// The card used to be the <button> itself. It keeps the text settings its
// contents inherited from it (a button resets these), so the title and readouts
// render as before. Hover sets box-shadow directly rather than through
// `shadow-raised`: that composes a five-layer shadow list, which would cross-fade
// from the card's shadow instead of morphing into it.
const CARD = cx(
  'group relative flex flex-col gap-6 p-(--card-body-padding) text-left cursor-pointer',
  'leading-[normal] whitespace-nowrap [font-feature-settings:normal] [text-rendering:auto]',
  'transition-[box-shadow,transform] duration-(--duration-fast) ease-in-out',
  'hover:[box-shadow:var(--shadow-raised)] active:transform-[translateY(1px)]',
)

interface StatCardProps {
  icon: ReactNode
  label: string
  /** Name of the open button: the readout in words, then where it goes. */
  ariaLabel: string
  /** Navigate into the tab when the card (or its caret) is tapped. */
  onOpen: () => void
  /** The readout is loading (e.g. a device scan in flight). */
  isLoading?: boolean
  /**
   * The card body: a colour-keyed readout (or a split of readouts). It may hold
   * its own control (the Devices card's Discover button), which sits beside the
   * open button rather than inside it.
   */
  children: ReactNode
}

/**
 * One of the small summary cards on Home: an icon + title row over a readout.
 * The title is a real heading, and a transparent button stretched over the
 * whole card opens the tab, so a control in the body is its sibling, never
 * nested inside it.
 */
export function StatCard({ icon, label, ariaLabel, onOpen, isLoading, children }: StatCardProps): JSX.Element {
  const titleId = useId()
  return (
    // Named by its own heading, as it has no CardHeader.
    <Card className={CARD} data-stat-card aria-labelledby={titleId} aria-busy={isLoading || undefined}>
      <div className="flex items-center gap-8">
        <span className="inline-flex items-center justify-center shrink-0 text-tertiary">{icon}</span>
        <h2 id={titleId} className="text-heading-small">
          {label}
        </h2>
        {/* Pushed to the far edge; always visible, brightening while the card is
            hovered or its open button has keyboard focus. */}
        <ChevronRightIcon
          size={16}
          className={cx(
            'ml-auto text-tertiary transition-[color] duration-(--duration-fast) ease-in-out',
            'group-hover:text-secondary group-has-[>button:focus-visible]:text-secondary',
          )}
        />
      </div>
      {/* The open button: transparent and stretched over the whole card, above the
          title and readout so a click anywhere lands on it, with a focus ring that
          follows the card's corners just inside its edge, which clips. A control in
          the body raises itself above it. */}
      <button
        type="button"
        className="absolute inset-0 z-1 rounded-[inherit] focus-visible:outline-offset-(--focus-inset)"
        data-stat-card-open
        onClick={onOpen}
        aria-label={ariaLabel}
      />
      {children}
    </Card>
  )
}

/**
 * Move focus to the open button of the card holding `element`. For a control
 * in the body that's about to unmount (Discover, replaced by the scan spinner),
 * so keyboard focus stays in the card instead of falling back to the page.
 */
export function focusStatCardOpenButton(element: HTMLElement): void {
  element.closest('[data-stat-card]')?.querySelector<HTMLElement>(':scope > [data-stat-card-open]')?.focus()
}

interface StatReadoutProps {
  /** What marks the value: a download/upload arrow, or the green "online" dot. */
  marker: 'down' | 'up' | 'online'
  value: string
  unit: string
  className?: string
}

/** A direction arrow (or key dot) inline with a compact value. */
export function StatReadout({ marker, value, unit, className }: StatReadoutProps): JSX.Element {
  return (
    <div className={cn('flex flex-row items-center gap-4 min-w-0', className)}>
      {marker === 'online' ? (
        <span className="size-6 rounded-full shrink-0 bg-status-positive" aria-hidden />
      ) : (
        <DirectionIcon series={marker} size={12} />
      )}
      <div className="metric metric-compact num">
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

/** The "no reading" body: a dash where the value would be. */
export function EmptyStatMetric(): JSX.Element {
  return (
    <div className="metric mt-2" aria-hidden>
      <span className="metric-value">—</span>
    </div>
  )
}
