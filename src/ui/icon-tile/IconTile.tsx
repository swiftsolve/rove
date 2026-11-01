import { forwardRef, type HTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { cn } from '../foundations/cn'
import { pressableProps } from '../foundations/pressable'

const tileVariants = cva('inline-flex shrink-0 items-center justify-center rounded-sm', {
  variants: {
    size: { sm: 'size-[30px]', md: 'size-[32px]', lg: 'size-[36px]' },
    /**
     * `wash`, a wash of the glyph's own colour (`className` sets it:
     * `text-series-down`); or `inset`, the neutral sunken fill with a secondary
     * glyph, for something uncategorised.
     */
    tint: {
      wash: 'bg-current/(--opacity-tint-md)',
      inset: 'bg-inset text-secondary',
    },
  },
  defaultVariants: { size: 'md', tint: 'wash' },
})

interface TileLookProps {
  size?: VariantOf<typeof tileVariants, 'size'>
  tint?: VariantOf<typeof tileVariants, 'tint'>
  /** The glyph's colour, which the tint follows, and the tile's place in its row. */
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
  { size, tint, className, children, ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn(tileVariants({ size, tint }), className)} {...props}>
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
  { size, tint, className, label, onClick, isDisabled, children },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        tileVariants({ size, tint }),
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
