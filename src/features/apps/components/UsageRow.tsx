import { cva, cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { ByteTotal } from '@/features/apps/components/ByteTotal'
import { RowName } from '@/features/apps/components/RowName'
import { TransferFigures } from '@/features/apps/components/TransferFigures'
import { totalBytes, type Transfer, transferLabel } from '@/features/apps/utils/transfer'
import { ChevronRightIcon, SplitBar, StretchedLink, type VariantOf } from '@/ui'

// The row, not the list, owns the inset, so the hairlines between rows span the
// full width.
const rowVariants = cva('flex flex-col gap-8 px-(--card-body-padding) py-12', {
  variants: {
    isLink: {
      true: cx(
        'group/row relative',
        'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-overlay-hover',
      ),
    },
  },
})

// In a link row the visual layers are click-through, so the overlay button owns
// every pointer interaction.
const mainLineVariants = cva('flex items-center justify-between gap-12', {
  variants: {
    isLink: { true: 'pointer-events-none' },
  },
})

// The bar and figures start at the icon's drawn left edge. A tile fills its box,
// so only the figures pull left, by the arrow's side bearing (~2px at 11px). A
// line icon is inset by its own bearing, so the bar moves in to match.
const barVariants = cva(null, {
  variants: {
    iconKind: { tile: null, line: 'ml-[3px]' },
    isLink: { true: 'pointer-events-none' },
  },
})
const figuresVariants = cva(null, {
  variants: {
    iconKind: { tile: '-ml-2', line: null },
    isLink: { true: 'pointer-events-none' },
  },
})

// A StretchedLink, so the block content needn't nest inside a button. Its focus
// ring rounds only where the first and last rows meet the card's corners.
const ROW_LINK = 'group-first/row:rounded-t-lg group-last/row:rounded-b-lg'

const CARET = cx(
  'text-tertiary opacity-35 transition-opacity duration-(--duration-fast) ease-in-out',
  'group-hover/row:opacity-75',
)

type UsageRowProps = {
  icon: ReactNode
  /**
   * How the icon is drawn: a `tile` (an app icon) fills its box, a `line` icon is
   * inset. Lines the bar and figures up with it.
   */
  iconKind: VariantOf<typeof barVariants, 'iconKind'>
  name: string
  transfer: Transfer
  /** The busiest row's total in the list, which every bar is scaled against. */
  busiest: number
  /** Makes the whole row a link, named by `label`, with a caret to show it. */
  link?: { label: string; onOpen: () => void }
}

/** A usage row: name and total, then a proportional down/up bar and the figures. */
export function UsageRow({ icon, iconKind, name, transfer, busiest, link }: UsageRowProps) {
  const isLink = link !== undefined
  return (
    <li className={rowVariants({ isLink })}>
      {link && <StretchedLink className={ROW_LINK} label={link.label} onClick={link.onOpen} />}
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
      <TransferFigures transfer={transfer} isDecorative className={figuresVariants({ iconKind, isLink })} />
    </li>
  )
}
