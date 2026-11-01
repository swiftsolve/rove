import { cva } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { useCountUp } from '../hooks/useCountUp'
import { cn } from '../foundations/cn'

const metricVariants = cva(null, {
  variants: {
    /** How healthy the value is, in the status text colours. */
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
  value: number
  status?: MetricStatus
  format: (n: number) => string
  className?: string
}): JSX.Element {
  const animated = useCountUp(value)
  return <span className={cn(metricVariants({ status }), className) || undefined}>{format(animated)}</span>
}
