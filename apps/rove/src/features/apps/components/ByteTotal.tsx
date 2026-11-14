import { MetricValue } from '@swiftsolve/rove-ui'

import { formatBytes } from '@/utils/format'

/**
 * A row's combined total, right of its name: counts up each poll like every
 * other usage figure, and never shrinks, so a long name truncates instead.
 */
export function ByteTotal({ bytes }: { bytes: number }) {
  return (
    <span className="type-caption shrink-0 text-secondary">
      <MetricValue value={bytes} format={formatBytes} />
    </span>
  )
}
