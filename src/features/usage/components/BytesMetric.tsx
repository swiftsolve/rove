import { splitBytes } from '@/lib/format'
import { DirectionIcon, Readout } from '@/ui'

export function BytesMetric({ label, bytes, series }: { label: string; bytes: number; series: 'down' | 'up' }) {
  const { value, unit } = splitBytes(bytes)
  return <Readout label={label} icon={<DirectionIcon series={series} />} value={value} unit={unit} />
}
