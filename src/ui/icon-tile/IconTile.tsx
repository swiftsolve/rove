import { forwardRef, type HTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { cn } from '../foundations/cn'
import { pressableProps } from '../foundations/pressable'

// Every colour but neutral washes the tile in the glyph's own colour.
const WASH = 'bg-current/(--opacity-tint-md)'

const tileVariants = cva('inline-flex shrink-0 items-center justify-center rounded-sm', {
  variants: {
    size: { sm: 'size-[30px]', md: 'size-[32px]', lg: 'size-[36px]' },
    color: {
      positive: cx(WASH, 'text-status-positive'),
      good: cx(WASH, 'text-status-good'),
      warning: cx(WASH, 'text-status-warning'),
      poor: cx(WASH, 'text-status-poor'),
      negative: cx(WASH, 'text-status-negative'),
      download: cx(WASH, 'text-series-down'),
      upload: cx(WASH, 'text-series-up'),
      neutral: 'bg-inset text-secondary',
    },
  },
  defaultVariants: { size: 'md' },
})

/** What the item is, as an IconTile colour. */
export type IconTileColor = VariantOf<typeof tileVariants, 'color'>

interface TileLookProps {
  size?: VariantOf<typeof tileVariants, 'size'>
  /**
   * The glyph's colour, washed across the tile. `neutral` is the sunken fill
   * with a secondary glyph, for something uncategorised or not yet rated.
   */
  color: IconTileColor
  /** The tile's place in its row. */
  className?: string
  /** The glyph. */
  children: ReactNode
}

type IconTileProps = TileLookProps & Omit<HTMLAttributes<HTMLSpanElement>, keyof TileLookProps>

/**
 * A rounded square holding an item's glyph, tinted by what the item is. It
 * takes a ref and extra props, so it can be a Tooltip's trigger.
 */
export const IconTile = forwardRef<HTMLSpanElement, IconTileProps>(function IconTile(
  { size, color, className, children, ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn(tileVariants({ size, color }), className)} {...props}>
      {children}
    </span>
  )
})

type IconTileButtonProps = TileLookProps & {
  /** Names it: the glyph alone says nothing to a screen reader. */
  label: string
  onClick: MouseEventHandler<HTMLButtonElement>
  /** Inert while what it opens is being replaced: no hover, no action, same look. */
  isDisabled?: boolean
}

/** An IconTile that opens something: hover deepens the tint and lifts it a pixel. */
export const IconTileButton = forwardRef<HTMLButtonElement, IconTileButtonProps>(function IconTileButton(
  { size, color, className, label, onClick, isDisabled, children },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        tileVariants({ size, color }),
        'transition-[background,transform] duration-(--duration-fast) ease-in-out data-disabled:cursor-default',
        'usable:hover:bg-current/(--opacity-tint-lg) usable:hover:transform-[translateY(-1px)]',
        className,
      )}
      aria-label={label}
      {...pressableProps({ isDisabled, onClick })}
    >
      {children}
    </button>
  )
})
