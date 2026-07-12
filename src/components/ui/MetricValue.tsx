import { useCountUp } from '@/hooks/useCountUp'

/**
 * A numeric readout that eases toward its latest value each poll (up or down),
 * matching the Live Traffic readouts. On first paint it shows the value outright
 * — the ease only kicks in when a subsequent poll changes the number.
 */
export function MetricValue({
  value,
  level,
  format,
}: {
  readonly value: number
  readonly level?: string
  readonly format: (n: number) => string
}): JSX.Element {
  const animated = useCountUp(value)
  return <span className={level}>{format(animated)}</span>
}
