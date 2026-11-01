import { formatBytes } from '@/lib/format'
import { MetricValue } from '@/ui'

/** A row's combined total, right of its name: counts up each poll like every
 *  other usage figure, and never shrinks, so a long name truncates instead. */
export function ByteTotal({ bytes }: { bytes: number }): JSX.Element {
  return (
    <MetricValue value={bytes} className="num shrink-0 text-sm text-secondary" format={formatBytes} />
  )
}
