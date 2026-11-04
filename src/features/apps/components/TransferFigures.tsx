import type { Transfer } from '@/features/apps/utils/transfer'
import { cn, DirectionIcon, MetricValue, type SpeedSeries } from '@/ui'
import { formatBytes } from '@/utils/format'

const FIGURE = 'inline-flex items-center gap-[5px] type-caption text-tertiary'
// Fixed width, so the down and up columns line up across rows.
const FIGURE_VALUE = 'min-w-[46px] text-right'

const SERIES_LABEL: Record<SpeedSeries, string> = { down: 'Down', up: 'Up' }

function TransferFigure({
  series,
  bytes,
  isDecorative,
}: {
  series: SpeedSeries
  bytes: number
  isDecorative: boolean
}) {
  return (
    <span className={FIGURE}>
      <DirectionIcon series={series} size={11} />
      {!isDecorative && <span className="sr-only">{SERIES_LABEL[series]}</span>}
      <MetricValue value={bytes} className={FIGURE_VALUE} format={formatBytes} />
    </span>
  )
}

type TransferFiguresProps = {
  transfer: Transfer
  /**
   * Hidden from screen readers, for a row that already reads the figures out
   * elsewhere (its bar's label). Otherwise each figure is named Down or Up.
   */
  isDecorative?: boolean
  className?: string
}

/** A row's download and upload figures: an arrow and the bytes, for each. */
export function TransferFigures({ transfer, isDecorative = false, className }: TransferFiguresProps) {
  return (
    <span className={cn('inline-flex items-center gap-12', className)} aria-hidden={isDecorative || undefined}>
      <TransferFigure series="down" bytes={transfer.rxBytes} isDecorative={isDecorative} />
      <TransferFigure series="up" bytes={transfer.txBytes} isDecorative={isDecorative} />
    </span>
  )
}
