import { DirectionIcon, MetricValue } from '@swiftsolve/rove-ui'
import { cx } from 'class-variance-authority'

import { formatBytes } from '@/utils/format'

// Full-bleed inset strip; the card's overflow:hidden rounds its bottom corners.
const TOTALS_FOOTER = cx(
  'type-caption flex items-center justify-between gap-12 text-tertiary',
  '-mx-(--card-body-padding) mt-12 -mb-(--card-body-padding) p-(--card-body-padding)',
  'bg-inset',
)

/** A card footer: a label on the left, down / up byte totals on the right, counting up as they change. */
export function TotalsFooter({ label, rxBytes, txBytes }: { label: string; rxBytes: number; txBytes: number }) {
  return (
    <p className={TOTALS_FOOTER}>
      {label}
      <span className="inline-flex items-center gap-12">
        <span className="inline-flex items-center gap-4">
          <DirectionIcon series="down" size={11} />
          <span className="sr-only">Downloaded</span>
          <MetricValue value={rxBytes} format={formatBytes} />
        </span>
        <span className="inline-flex items-center gap-4">
          <DirectionIcon series="up" size={11} />
          <span className="sr-only">Uploaded</span>
          <MetricValue value={txBytes} format={formatBytes} />
        </span>
      </span>
    </p>
  )
}
