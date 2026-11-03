import { cva } from 'class-variance-authority'

import { cn } from '../foundations/cn'
import type { VariantOf } from '../foundations/variants'
import { useCountUp } from '../hooks/useCountUp'

// The numeric face, with tabular figures so the width holds while it eases.
const metricVariants = cva('num', {
  variants: {
    status: { positive: 'text-positive', warning: 'text-warning', negative: 'text-negative' },
  },
})

/** A readout's health: green, amber or red. */
export type MetricStatus = VariantOf<typeof metricVariants, 'status'>

/**
 * A numeric readout that eases toward its latest value each poll (up or down),
 * matching the Traffic readouts. On first paint it shows the value outright
 * — the ease only kicks in when a subsequent poll changes the number.
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
  /** Turns the number, mid-ease too, into its text: `(n) => n.toFixed(1)`. */
  format: (n: number) => string
  /** Its place in a layout: a column's width and alignment (`min-w-[46px] text-right`). It takes its size and colour from the text around it. */
  className?: string
}) {
  const animated = useCountUp(value)
  return <span className={cn(metricVariants({ status }), className)}>{format(animated)}</span>
}
