import { memo } from 'react'
import { splitSpeedMbps } from '@/lib/format'
import { useCountUp } from '@/hooks/useCountUp'
import DirectionIcon from '@/components/ui/DirectionIcon'
import './SpeedReadout.css'

export type SpeedSeries = 'down' | 'up'

/** Live rates below this are background noise (OS chatter, keepalives). Show them
 *  as zero rather than letting toFixed(1) round them up to 0.1 Mbps — otherwise
 *  the readout reads 0.1 when nothing is really downloading or uploading. */
const LIVE_FLOOR_MBPS = 0.1

interface SpeedReadoutProps {
  readonly label: string
  readonly mbps: number
  readonly series: SpeedSeries
  readonly compact?: boolean
}

function SpeedReadout({
  label,
  mbps,
  series,
  compact = false,
}: SpeedReadoutProps): JSX.Element {
  const shown = mbps < LIVE_FLOOR_MBPS ? 0 : mbps
  const animated = useCountUp(shown)
  const { value, unit } = splitSpeedMbps(animated)
  const actual = splitSpeedMbps(shown)

  return (
    <div className={`speed-readout ${series}`}>
      <div className="speed-readout-label">
        <DirectionIcon series={series} />
        <span className="field-label">{label}</span>
      </div>

      <div
        className={`metric num ${compact ? 'metric-compact' : ''}`}
        aria-label={`${label}: ${actual.value} ${actual.unit}`}
      >
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

export default memo(SpeedReadout)
