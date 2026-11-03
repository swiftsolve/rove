import { cx } from 'class-variance-authority'

import { formatBytes } from '@/lib/format'
import { DirectionIcon } from '@/ui'

// Full-bleed inset strip; the card's overflow:hidden rounds its bottom corners.
const TOTALS_FOOTER = cx(
  'type-caption text-tertiary flex items-center justify-between gap-12',
  'mt-12 -mx-(--card-body-padding) -mb-(--card-body-padding) p-(--card-body-padding)',
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
