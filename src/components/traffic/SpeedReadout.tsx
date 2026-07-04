import { memo } from 'react'
import { splitSpeedMbps } from '@/lib/format'
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
  const { value, unit } = splitSpeedMbps(mbps)

  return (
    <div className={`speed-readout ${series}`}>
      <div className="speed-readout-label">
        <span className={`speed-readout-key ${series}`} aria-hidden />
        <span className="field-label">{label}</span>
      </div>

      <div
        className={`metric num ${compact ? 'metric-compact' : ''}`}
        aria-label={`${label}: ${value} ${unit}`}
      >
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

export default memo(SpeedReadout)
