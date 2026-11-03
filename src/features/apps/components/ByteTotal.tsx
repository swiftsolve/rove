import { MetricValue } from '@/ui'
import { formatBytes } from '@/utils/format'

/**
 * A row's combined total, right of its name: counts up each poll like every
 * other usage figure, and never shrinks, so a long name truncates instead.
 */
export function ByteTotal({ bytes }: { bytes: number }) {
  return (
    <span className="shrink-0 text-sm text-secondary">
      <MetricValue value={bytes} format={formatBytes} />
    </span>
  )
}
