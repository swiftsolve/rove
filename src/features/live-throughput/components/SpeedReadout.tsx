import { memo } from 'react'
import { splitSpeedMbps } from '@/lib/format'
import { DirectionIcon, Readout, useCountUp, type SpeedSeries } from '@/ui'

/** Live rates below this are background noise (OS chatter, keepalives). Show them
 *  as zero rather than letting toFixed(1) round them up to 0.1 Mbps — otherwise
 *  the readout reads 0.1 when nothing is really downloading or uploading. */
const LIVE_FLOOR_MBPS = 0.1

type SpeedReadoutProps = {
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

  // The visible digits count up between polls; screen readers get the settled
  // value instead of a mid-animation one.
  return (
    <Readout
      className="min-w-0 flex-1"
      label={label}
      icon={<DirectionIcon series={series} />}
      value={value}
      unit={unit}
      spokenValue={`${actual.value} ${actual.unit}`}
    />
  )
})
