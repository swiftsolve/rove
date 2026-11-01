import { cva, type VariantProps } from 'class-variance-authority'
import { useCountUp } from '@/hooks/useCountUp'
import { cn } from '@/lib/cn'

const metricVariants = cva(undefined, {
  variants: {
    /** How healthy the value is, in the status text colours. */
    status: { positive: 'text-positive', warning: 'text-warning', negative: 'text-negative' },
  },
})

/** A readout's health: green, amber or red. */
export type MetricStatus = NonNullable<VariantProps<typeof metricVariants>['status']>

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
