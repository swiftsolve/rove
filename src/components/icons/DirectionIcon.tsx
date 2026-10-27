import { ArrowDownIcon, ArrowUpIcon } from '@/components/icons/Icons'
import styles from './DirectionIcon.module.css'

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
 * `--series-*` variables via the `data-series` attribute; the icon inherits it through
 * `currentColor`.
 */
export function DirectionIcon({ series, size = 14 }: DirectionIconProps): JSX.Element {
  const Icon = series === 'down' ? ArrowDownIcon : ArrowUpIcon
  return (
    <span className={styles.root} data-series={series} aria-hidden>
      <Icon size={size} />
    </span>
  )
}
