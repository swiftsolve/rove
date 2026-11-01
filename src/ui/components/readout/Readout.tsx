import type { ReactNode } from 'react'
import { cn } from '../../foundations/cn'

interface ValueParts {
  /** The number, formatted: "182", "4.6". */
  value: string
  unit: string
  /**
   * What a screen reader hears instead, when the visible number is animating
   * ("182 Mbps" while the digits still count up to it).
   */
  spokenValue?: string
}

function ValueAndUnit({ value, unit, spokenValue }: ValueParts): JSX.Element {
  const isSpokenApart = spokenValue != null
  return (
    <>
      <span className="metric-value" aria-hidden={isSpokenApart || undefined}>
        {value}
      </span>
      <span className="metric-unit" aria-hidden={isSpokenApart || undefined}>
        {unit}
      </span>
      {isSpokenApart && <span className="sr-only">{spokenValue}</span>}
    </>
  )
}

interface ReadoutProps extends ValueParts {
  label: string
  /** A glyph before the label: the direction arrow. */
  icon?: ReactNode
  className?: string
}

/**
 * A large labelled number (live speed, data used), as a term and description:
 * render it inside a `<dl>`.
 */
export function Readout({ label, icon, className, ...valueParts }: ReadoutProps): JSX.Element {
  return (
    <div className={className}>
      <dt className="mb-8 flex items-center gap-6">
        {icon}
        <span className="text-overline">{label}</span>
      </dt>
      <dd className="metric num">
        <ValueAndUnit {...valueParts} />
      </dd>
    </div>
  )
}

interface ReadoutValueProps extends ValueParts {
  /** `compact` for a summary card's figure. */
  size?: 'large' | 'compact'
  className?: string
}

/** A number and its unit, on their own, at a readout's size. */
export function ReadoutValue({ size = 'large', className, ...valueParts }: ReadoutValueProps): JSX.Element {
  return (
    <div className={cn('metric num', size === 'compact' && 'metric-compact', className)}>
      <ValueAndUnit {...valueParts} />
    </div>
  )
}
