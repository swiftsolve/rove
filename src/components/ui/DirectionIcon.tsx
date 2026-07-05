import type { SpeedSeries } from '@/components/traffic/SpeedReadout'
import { ArrowDownIcon, ArrowUpIcon } from '@/components/ui/Icons'
import './DirectionIcon.css'

interface DirectionIconProps {
  readonly series: SpeedSeries
  readonly size?: number
}

/**
 * The colour-keyed direction glyph that marks a download/upload readout: a blue
 * down-arrow for download, a purple up-arrow for upload. Replaces the plain
 * colour dots so the icon itself carries the meaning. Colour comes from the
 * `--series-*` variables via the `series` class; the icon inherits it through
 * `currentColor`.
 */
export default function DirectionIcon({ series, size = 14 }: DirectionIconProps): JSX.Element {
  const Icon = series === 'down' ? ArrowDownIcon : ArrowUpIcon
  return (
    <span className={`direction-icon ${series}`} aria-hidden>
      <Icon size={size} />
    </span>
  )
}
