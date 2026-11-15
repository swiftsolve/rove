import { CardFooter, DirectionIcon, MetricValue } from '@swiftsolve/rove-ui'

import { formatBytes } from '@/utils/format'

const TOTALS_LINE = 'type-caption flex items-center justify-between gap-12 text-tertiary'

/** A card's footer, after its CardBody: a label on the left, down / up byte totals on the right, counting up as they change. */
export function TotalsFooter({ label, rxBytes, txBytes }: { label: string; rxBytes: number; txBytes: number }) {
  return (
    <CardFooter>
      <p className={TOTALS_LINE}>
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
    </CardFooter>
  )
}
