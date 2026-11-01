import { forwardRef, type MouseEventHandler, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../foundations/cn'
import { pressableProps } from '../foundations/pressable'

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

type IconTileButtonProps = IconTileProps & {
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
