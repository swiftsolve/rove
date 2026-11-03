import type { ReactNode } from 'react'
import { cn } from '../foundations/cn'

type ValueParts = {
  /** The number, formatted: "182", "4.6". */
  value: string
  /** After the number, smaller: "Mbps", "GB". */
  unit: string
  /**
   * What a screen reader hears instead, when the visible number is animating
   * ("182 Mbps" while the digits still count up to it).
   */
  spokenValue?: string
}

function ValueAndUnit({ value, unit, spokenValue, size }: ValueParts & Pick<ReadoutProps, 'size'>) {
  const isSpokenApart = spokenValue != null
  return (
    <>
      <span
        className={cn(size === 'compact' ? 'type-number-large' : 'type-number-display', 'metric-value')}
        aria-hidden={isSpokenApart || undefined}
      >
        {value}
      </span>
      <span className="type-body-small metric-unit" aria-hidden={isSpokenApart || undefined}>
        {unit}
      </span>
      {isSpokenApart && <span className="sr-only">{spokenValue}</span>}
    </>
  )
}

type ReadoutProps = ValueParts & {
  /** Names the figure ("Download", "Data used"). With one, render the readout inside a `<dl>`. */
  label?: string
  /** An icon: before the label, or before the figure when there's no label. */
  icon?: ReactNode
  /** `compact` for a summary card's figure, which has no label. */
  size?: 'large' | 'compact'
  /** Its place in a layout: `min-w-0 flex-1` to share a row with other readouts. */
  className?: string
}

/**
 * A number and its unit (live speed, data used), with an optional label and
 * icon. A labelled readout is a term and its description, so it goes inside a
 * `<dl>`; without a label, the icon sits inline with the figure.
 */
export function Readout({ label, icon, size = 'large', className, ...valueParts }: ReadoutProps) {
  const figureClass = cn('metric num', size === 'compact' && 'metric-compact')
  if (label == null) {
    return (
      <div className={cn(figureClass, 'min-w-0', className)}>
        {icon != null && <span className="metric-icon">{icon}</span>}
        <ValueAndUnit size={size} {...valueParts} />
      </div>
    )
  }
  return (
    <div className={className}>
      <dt className="mb-8 flex items-center gap-6">
        {icon}
        <span className="type-overline text-tertiary">{label}</span>
      </dt>
      <dd className={figureClass}>
        <ValueAndUnit size={size} {...valueParts} />
      </dd>
    </div>
  )
}
