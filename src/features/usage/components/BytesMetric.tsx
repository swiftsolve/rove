import { DirectionIcon, Readout, useCountUp } from '@/ui'
import { splitBytes } from '@/utils/format'

/**
 * A byte total behind its direction arrow. The digits count up to each new
 * reading; screen readers get the settled value instead of a mid-count one.
 */
export function BytesMetric({ label, bytes, series }: { label: string; bytes: number; series: 'down' | 'up' }) {
  const shown = splitBytes(useCountUp(bytes))
  const settled = splitBytes(bytes)
  return (
    <Readout
      label={label}
      icon={<DirectionIcon series={series} />}
      value={shown.value}
      unit={shown.unit}
      spokenValue={`${settled.value} ${settled.unit}`}
    />
  )
}
