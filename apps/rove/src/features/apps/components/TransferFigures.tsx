import { cn, DirectionIcon, MetricValue, type SpeedSeries } from '@swiftsolve/rove-ui'
import { cx } from 'class-variance-authority'

import type { Transfer } from '@/features/apps/utils/transfer'
import { formatBytes } from '@/utils/format'

const FIGURE = 'inline-flex items-center gap-[5px] type-caption text-tertiary'
// The widest a figure can read: `formatBytes` shows three significant digits,
// so at most three digits, a point and a two-letter unit. The value takes this
// width, right-aligned, so units line up on the right across rows and any
// spare room sits between the arrow and the number, never more than that.
const WIDEST_FIGURE = '88.8 MB'
const FIGURE_CELL = 'col-start-1 row-start-1'

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
      <span className="grid text-right">
        <MetricValue value={bytes} className={FIGURE_CELL} format={formatBytes} />
        <span className={cx('invisible num', FIGURE_CELL)} aria-hidden>
          {WIDEST_FIGURE}
        </span>
      </span>
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
