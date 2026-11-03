import { cva } from 'class-variance-authority'

import { cn } from '../utils/cn'
import { ArrowDownIcon, ArrowUpIcon, type IconProps } from './Icons'

const rootVariants = cva('inline-flex items-center shrink-0', {
  variants: {
    series: { down: 'text-series-down', up: 'text-series-up' },
  },
})

/** Which half of a download/upload pair a value or icon belongs to. */
export type SpeedSeries = 'down' | 'up'

type DirectionIconProps = IconProps & {
  /** `down`, a blue down-arrow for download; `up`, a purple up-arrow for upload. */
  series: SpeedSeries
}

/**
 * Marks a download or upload readout: a blue down-arrow or a purple up-arrow,
 * in the `--series-*` colours, so the shape carries the meaning as well as the
 * colour.
 */
export function DirectionIcon({ series, size = 14, className }: DirectionIconProps) {
  const Icon = series === 'down' ? ArrowDownIcon : ArrowUpIcon
  return (
    <span className={cn(rootVariants({ series }), className)} aria-hidden>
      <Icon size={size} />
    </span>
  )
}
