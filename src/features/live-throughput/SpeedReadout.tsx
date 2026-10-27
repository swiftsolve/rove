import { memo } from 'react'
import { splitSpeedMbps } from '@/lib/format'
import { useCountUp } from '@/hooks/useCountUp'
import { DirectionIcon, type SpeedSeries } from '@/components/icons/DirectionIcon'
import styles from './SpeedReadout.module.css'

/** Live rates below this are background noise (OS chatter, keepalives). Show them
 *  as zero rather than letting toFixed(1) round them up to 0.1 Mbps — otherwise
 *  the readout reads 0.1 when nothing is really downloading or uploading. */
const LIVE_FLOOR_MBPS = 0.1

interface SpeedReadoutProps {
  label: string
  mbps: number
  series: SpeedSeries
}

export const SpeedReadout = memo(function SpeedReadout({
  label,
  mbps,
  series,
}: SpeedReadoutProps): JSX.Element {
  const shown = mbps < LIVE_FLOOR_MBPS ? 0 : mbps
  const animated = useCountUp(shown)
  const { value, unit } = splitSpeedMbps(animated)
  const actual = splitSpeedMbps(shown)

  return (
    <div className={styles.root}>
      <dt className={styles.label}>
        <DirectionIcon series={series} />
        <span className="field-label">{label}</span>
      </dt>

      {/* The visible digits count up between polls; screen readers get the
          settled value instead of a mid-animation one. */}
      <dd className="metric num">
        <span className="metric-value" aria-hidden>{value}</span>
        <span className="metric-unit" aria-hidden>{unit}</span>
        <span className="sr-only">{`${actual.value} ${actual.unit}`}</span>
      </dd>
    </div>
  )
})
