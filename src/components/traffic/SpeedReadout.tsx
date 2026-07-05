import { memo } from 'react'
import { splitSpeedMbps } from '@/lib/format'
import { useCountUp } from '@/hooks/useCountUp'
import './SpeedReadout.css'

export type SpeedSeries = 'down' | 'up'

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
  const animated = useCountUp(mbps)
  const { value, unit } = splitSpeedMbps(animated)
  const actual = splitSpeedMbps(mbps)

  return (
    <div className={`speed-readout ${series}`}>
      <div className="speed-readout-label">
        <span className={`speed-readout-key ${series}`} aria-hidden />
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
