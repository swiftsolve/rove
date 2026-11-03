import { cva } from 'class-variance-authority'

import { cn } from '../foundations/cn'
import { STATUS_TEXT } from '../foundations/status'
import type { VariantOf } from '../foundations/variants'
import { useCountUp } from '../hooks/useCountUp'
import { NoValue } from '../no-value/NoValue'

// Tabular figures, so the width holds while it eases.
const metricVariants = cva('num', {
  variants: {
    status: STATUS_TEXT,
  },
})

/** A readout's health: green, amber or red. */
export type MetricStatus = VariantOf<typeof metricVariants, 'status'>

/**
 * A number that eases toward its latest value each poll. The first paint shows
 * the value outright; only a later change eases.
 */
export function MetricValue({
  value,
  status,
  format,
  className,
}: {
  /** The latest value; the figure eases toward it. */
  value: number
  /** How healthy the value is, in the status text colours. */
  status?: MetricStatus
  /**
   * Turns the number, mid-ease too, into its text: `(n) => n.toFixed(1)`.
   * Null draws a NoValue bar.
   */
  format: (n: number) => string | null
  /**
   * Its place in a layout: a column's width and alignment
   * (`min-w-[46px] text-right`). It takes its size and colour from the text
   * around it.
   */
  className?: string
}) {
  const animated = useCountUp(value)
  return <span className={cn(metricVariants({ status }), className)}>{format(animated) ?? <NoValue />}</span>
}
