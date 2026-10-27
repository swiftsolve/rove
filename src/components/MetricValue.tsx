import { cva, type VariantProps } from 'class-variance-authority'
import { cx } from '@/lib/cx'
import { useCountUp } from '@/hooks/useCountUp'

const metricVariants = cva(undefined, {
  variants: {
    /** How healthy the value is, as the shared `val-*` text colours. */
    level: { good: 'val-good', warn: 'val-warn', bad: 'val-bad' },
  },
})

/** A health level for a readout: green, amber or red. */
export type MetricLevel = NonNullable<VariantProps<typeof metricVariants>['level']>

/**
 * A numeric readout that eases toward its latest value each poll (up or down),
 * matching the Traffic readouts. On first paint it shows the value outright
 * — the ease only kicks in when a subsequent poll changes the number.
 */
export function MetricValue({
  value,
  level,
  format,
  className,
}: {
  value: number
  level?: MetricLevel
  format: (n: number) => string
  className?: string
}): JSX.Element {
  const animated = useCountUp(value)
  return <span className={cx(metricVariants({ level }), className) || undefined}>{format(animated)}</span>
}
