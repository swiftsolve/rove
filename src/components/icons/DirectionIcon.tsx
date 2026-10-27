import { cva } from 'class-variance-authority'
import { ArrowDownIcon, ArrowUpIcon } from '@/components/icons/Icons'
import styles from './DirectionIcon.module.css'

const rootVariants = cva(styles.root, {
  variants: {
    series: { down: styles.seriesDown, up: styles.seriesUp },
  },
})

/** Which half of a download/upload pair a value or icon belongs to. */
export type SpeedSeries = 'down' | 'up'

interface DirectionIconProps {
  series: SpeedSeries
  size?: number
}

/**
 * The colour-keyed direction glyph that marks a download/upload readout: a blue
 * down-arrow for download, a purple up-arrow for upload. Replaces the plain
 * colour dots so the icon itself carries the meaning. Colour comes from the
 * `--series-*` variables via the `.series-*` class; the icon inherits it through
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
