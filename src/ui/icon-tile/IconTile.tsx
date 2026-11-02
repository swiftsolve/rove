import { forwardRef, type CSSProperties, type HTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { cn } from '../foundations/cn'
import { pressableProps } from '../foundations/pressable'

const tileVariants = cva('inline-flex shrink-0 items-center justify-center rounded-sm', {
  variants: {
    size: { sm: 'size-[30px]', md: 'size-[32px]', lg: 'size-[36px]' },
    // Any colour but neutral washes the tile in the icon's own colour.
    isNeutral: { true: 'bg-inset text-secondary', false: 'bg-current/(--opacity-tint-md)' },
  },
  defaultVariants: { size: 'md' },
})

/** An IconTile colour: any CSS colour, usually a token (`var(--series-down)`), or `neutral`. */
export type IconTileColor = 'neutral' | (string & {})

interface TileLookProps {
  /** 30, 32 or 36px square. */
  size?: VariantOf<typeof tileVariants, 'size'>
  /**
   * The icon's colour, washed across the tile: any CSS colour, usually a token
   * (`var(--status-positive)`). `neutral` is the sunken fill with a secondary
   * icon, for something uncategorised or not yet rated.
   */
  color: IconTileColor
  /** The tile's place in its row: `shrink-0` so a long name can't squeeze it. */
  className?: string
  /** The icon, sized by the caller: `<VideoCallIcon size={17} />`. */
  icon: ReactNode
}

/** The tile's classes, and the icon colour its wash follows. */
function tileLook(size: TileLookProps['size'], color: IconTileColor): { className: string; style?: CSSProperties } {
  const isNeutral = color === 'neutral'
  return { className: tileVariants({ size, isNeutral }), style: isNeutral ? undefined : { color } }
}

type IconTileProps = TileLookProps &Omit<HTMLAttributes<HTMLSpanElement>, keyof TileLookProps | 'children'>

/**
 * A rounded square holding an item's icon, tinted by what the item is. It
 * takes a ref and extra props, so it can be a Tooltip's trigger.
 */
export const IconTile = forwardRef<HTMLSpanElement, IconTileProps>(function IconTile(
  { size = 'md', color, className, icon, style, ...props },
  ref,
) {
  const look = tileLook(size, color)
  return (
    <span ref={ref} className={cn(look.className, className)} style={{ ...look.style, ...style }} {...props}>
      {icon}
    </span>
  )
})

type IconTileButtonProps = TileLookProps & {
  /** Names it: the icon alone says nothing to a screen reader. */
  label: string
  /** Opens what the tile stands for. */
  onClick: MouseEventHandler<HTMLButtonElement>
  /** Inert while what it opens is being replaced: no hover, no action, same look. */
  isDisabled?: boolean
}

/** An IconTile that opens something: hover deepens the tint and lifts it a pixel. */
export const IconTileButton = forwardRef<HTMLButtonElement, IconTileButtonProps>(function IconTileButton(
  { size = 'md', color, className, label, onClick, isDisabled = false, icon },
  ref,
) {
  const look = tileLook(size, color)
  return (
    <button
      ref={ref}
      type="button"
      style={look.style}
      className={cn(
        look.className,
        'transition-[background,transform] duration-(--duration-fast) ease-in-out data-disabled:cursor-default',
        'usable:hover:bg-current/(--opacity-tint-lg) usable:hover:transform-[translateY(-1px)]',
        className,
      )}
      aria-label={label}
      {...pressableProps({ isDisabled, onClick })}
    >
      {icon}
    </button>
  )
})
