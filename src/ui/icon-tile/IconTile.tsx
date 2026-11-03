import { cva } from 'class-variance-authority'
import type { ComponentProps, CSSProperties, MouseEventHandler, ReactNode } from 'react'

import { cn } from '../foundations/cn'
import { pressableProps } from '../foundations/pressable'
import { type TintColor, tintStyle } from '../foundations/tint'
import type { VariantOf } from '../foundations/variants'

const tileVariants = cva('inline-flex shrink-0 items-center justify-center rounded-sm', {
  variants: {
    size: { sm: 'size-[30px]', md: 'size-[32px]', lg: 'size-[36px]' },
    // Any colour but neutral washes the tile in the icon's own colour.
    isNeutral: { true: 'bg-inset text-secondary', false: 'bg-current/(--opacity-tint-md)' },
  },
  defaultVariants: { size: 'md' },
})

/** An IconTile colour: any CSS colour, usually a token (`var(--series-down)`), or `neutral`. */
export type IconTileColor = TintColor

type TileLookProps = {
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
  return { className: tileVariants({ size, isNeutral: color === 'neutral' }), style: tintStyle(color) }
}

type IconTileProps = TileLookProps & Omit<ComponentProps<'span'>, keyof TileLookProps | 'children'>

/**
 * A rounded square holding an item's icon, tinted by what the item is. It
 * takes a ref and extra props, so it can be a Tooltip's trigger.
 */
export function IconTile({ size = 'md', color, className, icon, style, ...props }: IconTileProps) {
  const look = tileLook(size, color)
  return (
    <span className={cn(look.className, className)} style={{ ...look.style, ...style }} {...props}>
      {icon}
    </span>
  )
}

type IconTileButtonProps = TileLookProps &
  Omit<ComponentProps<'button'>, keyof TileLookProps | 'children' | 'onClick' | 'disabled' | 'type'> & {
    /** Names it: the icon alone says nothing to a screen reader. */
    label: string
    /** Opens what the tile stands for. */
    onClick: MouseEventHandler<HTMLButtonElement>
    /** Inert while what it opens is being replaced: no hover, no action, same look. */
    isDisabled?: boolean
  }

/** An IconTile that opens something: hover and keyboard focus deepen the tint and lift it, a touch larger. */
export function IconTileButton({
  size = 'md',
  color,
  className,
  label,
  onClick,
  isDisabled = false,
  icon,
  style,
  ...props
}: IconTileButtonProps) {
  const look = tileLook(size, color)
  return (
    <button
      {...props}
      type="button"
      style={{ ...look.style, ...style }}
      className={cn(
        look.className,
        'transition-[background,transform] duration-(--duration-fast) ease-out data-disabled:cursor-default',
        'usable:hover:bg-current/(--opacity-tint-lg) usable:hover:transform-[translateY(-2px)_scale(1.06)]',
        'usable:focus-visible:bg-current/(--opacity-tint-lg) usable:focus-visible:transform-[translateY(-2px)_scale(1.06)]',
        className,
      )}
      aria-label={label}
      {...pressableProps({ isDisabled, onClick })}
    >
      {icon}
    </button>
  )
}
