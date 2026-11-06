import { cx } from 'class-variance-authority'

import { DirectionIcon } from '@/ui'
import { formatBytes } from '@/utils/format'

// Full-bleed inset strip; the card's overflow:hidden rounds its bottom corners.
const TOTALS_FOOTER = cx(
  'type-caption flex items-center justify-between gap-12 text-tertiary',
  '-mx-(--card-body-padding) mt-12 -mb-(--card-body-padding) p-(--card-body-padding)',
  'bg-inset',
)

/** A card footer: a label on the left, down / up byte totals on the right. */
export function TotalsFooter({ label, rxBytes, txBytes }: { label: string; rxBytes: number; txBytes: number }) {
  return (
    <p className={TOTALS_FOOTER}>
      <span>{label}</span>
      <span className="inline-flex items-center gap-12">
        <span className="inline-flex items-center gap-4">
          <DirectionIcon series="down" size={11} />
          <span className="sr-only">Downloaded</span>
          <span className="num">{formatBytes(rxBytes)}</span>
        </span>
        <span className="inline-flex items-center gap-4">
          <DirectionIcon series="up" size={11} />
          <span className="sr-only">Uploaded</span>
          <span className="num">{formatBytes(txBytes)}</span>
        </span>
      </span>
    </p>
  )
}
