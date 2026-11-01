import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../foundations/cn'

const tileVariants = cva('inline-flex shrink-0 items-center justify-center rounded-sm', {
  variants: {
    size: { sm: 'size-[30px]', md: 'size-[32px]', lg: 'size-[36px]' },
    /**
     * A wash of the glyph's own colour (`className` sets it: `text-series-down`),
     * from the faintest (`xs`, an absent connection) to `md`; or `inset`, the
     * neutral sunken fill with a secondary glyph, for something uncategorised.
     */
    tint: {
      xs: 'bg-current/(--opacity-tint-xs)',
      sm: 'bg-current/(--opacity-tint-sm)',
      md: 'bg-current/(--opacity-tint-md)',
      inset: 'bg-inset text-secondary',
    },
  },
  defaultVariants: { size: 'md', tint: 'md' },
})

interface IconTileProps {
  size?: 'sm' | 'md' | 'lg'
  tint?: 'xs' | 'sm' | 'md' | 'inset'
  /** The glyph's colour, which the tint follows, and the tile's place in its row. */
  className?: string
  /** The glyph. */
  children: ReactNode
}

/** A rounded square holding an item's glyph, tinted by what the item is. */
export function IconTile({ size, tint, className, children }: IconTileProps): JSX.Element {
  return <span className={cn(tileVariants({ size, tint }), className)}>{children}</span>
}
