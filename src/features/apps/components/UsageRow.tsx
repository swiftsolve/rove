import type { ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { ChevronRightIcon, StretchedButton, type VariantOf } from '@/ui'
import { totalBytes, transferLabel, type Transfer } from '@/features/apps/utils/transfer'
import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { RowName } from '@/features/apps/components/RowName'
import { SplitBar } from '@/features/apps/components/SplitBar'
import { TransferFigures } from '@/features/apps/components/TransferFigures'

// A row runs edge to edge in the card and owns the horizontal inset, so the
// hairlines between rows (on the list) span the full width. Every row carries
// equal top and bottom padding, so the first and last aren't special-cased.
// A link row hovers with the Speed page's capability-row wash.
const rowVariants = cva('flex flex-col gap-8 px-(--card-body-padding) py-12', {
  variants: {
    isLink: {
      true: cx(
        'group/row relative',
        'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-faint',
      ),
    },
  },
})

// In a link row the visual layers (this line, the bar and the figures) are
// click-through, so the overlay button owns all pointer interaction (cursor and
// click), the caret included.
const mainLineVariants = cva('flex items-center justify-between gap-12', {
  variants: {
    isLink: { true: 'pointer-events-none' },
  },
})

// The bar and the figures start at the icon's drawn left edge. A tile fills its
// box, so the bar starts flush and the figures pull left by the arrow glyph's
// side bearing (~2px at 11px). A line glyph is inset by its own bearing, so the
// bar sits just inside it and the down arrow lands centred under it.
const barVariants = cva(null, {
  variants: {
    iconKind: { tile: null, glyph: 'ml-[3px]' },
    isLink: { true: 'pointer-events-none' },
  },
})
const figuresVariants = cva(null, {
  variants: {
    iconKind: { tile: '-ml-2', glyph: null },
    isLink: { true: 'pointer-events-none' },
  },
})

// The whole row is the link, through a StretchedButton, so the block content
// needn't nest inside a button. Its focus ring sits just inside the row (rows
// run edge to edge), square except where the first and last rows meet the
// card's rounded corners.
const ROW_LINK = 'group-first/row:rounded-t-lg group-last/row:rounded-b-lg'

const CARET = cx(
  'text-tertiary opacity-35 transition-opacity duration-(--duration-fast) ease-in-out',
  'group-hover/row:opacity-75',
)

interface UsageRowProps {
  icon: ReactNode
  /** How the icon is drawn: a `tile` (an app icon) fills its box, a `glyph` (a
   *  line icon) is inset. Lines the bar and figures up with it. */
  iconKind: VariantOf<typeof barVariants, 'iconKind'>
  name: string
  transfer: Transfer
  /** The busiest row's total in the list, which every bar is scaled against. */
  busiest: number
  /** Makes the whole row a link, named by `label`, with a caret to show it. */
  link?: { label: string; onOpen: () => void }
}

/** One usage row, styled like a Services row: icon and name on the left, the
 *  total on the right, then a proportional down/up bar and the byte figures
 *  beneath. */
export function UsageRow({
  icon,
  iconKind,
  name,
  transfer,
  busiest,
  link,
}: UsageRowProps): JSX.Element {
  const isLink = link !== undefined
  return (
    <li className={rowVariants({ isLink })}>
      {link && (
        <StretchedButton className={ROW_LINK} label={link.label} onClick={link.onOpen} />
      )}
      <div className={mainLineVariants({ isLink })}>
        <RowName icon={icon} name={name} />
        <span className="inline-flex shrink-0 items-center gap-8">
          <ByteTotal bytes={totalBytes(transfer)} />
          {isLink && <ChevronRightIcon size={16} className={CARET} aria-hidden />}
        </span>
      </div>
      <SplitBar
        down={transfer.rxBytes}
        up={transfer.txBytes}
        max={busiest}
        label={transferLabel(transfer)}
        className={barVariants({ iconKind, isLink })}
      />
      {/* The bar's label above already reads these figures out. */}
      <TransferFigures
        transfer={transfer}
        isDecorative
        className={figuresVariants({ iconKind, isLink })}
      />
    </li>
  )
}
