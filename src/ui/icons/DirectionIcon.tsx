import { cva } from 'class-variance-authority'
import { ArrowDownIcon, ArrowUpIcon } from './Icons'

const rootVariants = cva('inline-flex items-center shrink-0', {
  variants: {
    series: { down: 'text-series-down', up: 'text-series-up' },
  },
})

/** Which half of a download/upload pair a value or icon belongs to. */
export type SpeedSeries = 'down' | 'up'

interface DirectionIconProps {
  /** `down`, a blue down-arrow for download; `up`, a purple up-arrow for upload. */
  series: SpeedSeries
  /** Its width and height in px: 14 by default. */
  size?: number
}

/**
 * The colour-keyed direction icon that marks a download/upload readout: a blue
 * down-arrow for download, a purple up-arrow for upload. Replaces the plain
 * colour dots so the icon itself carries the meaning. Colour comes from the
 * `--series-*` variables via the `text-series-*` utility; the icon inherits it through
 * `currentColor`.
 */
export function DirectionIcon({ series, size = 14 }: DirectionIconProps): JSX.Element {
  const Icon = series === 'down' ? ArrowDownIcon : ArrowUpIcon
  return (
    <span className={rootVariants({ series })} aria-hidden>
      <Icon size={size} />
    </span>
  )
}
