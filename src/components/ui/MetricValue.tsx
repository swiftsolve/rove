import { useCountUp } from '@/hooks/useCountUp'

/**
 * A numeric readout that eases toward its latest value each poll (up or down),
 * matching the Traffic readouts. On first paint it shows the value outright
 * — the ease only kicks in when a subsequent poll changes the number.
 */
export function MetricValue({
  value,
  level,
  format,
}: {
  value: number
  level?: string
  format: (n: number) => string
}): JSX.Element {
  const animated = useCountUp(value)
  return <span className={level}>{format(animated)}</span>
}
