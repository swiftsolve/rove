import { splitSpeedMbps } from '@/lib/format'
import { DirectionIcon, Readout, useCountUp, type SpeedSeries } from '@/ui'

/** Live rates below this are background noise (OS chatter, keepalives). Show them
 *  as zero rather than letting toFixed(1) round them up to 0.1 Mbps — otherwise
 *  the readout reads 0.1 when nothing is really downloading or uploading. */
const NOISE_FLOOR_MBPS = 0.1

type SpeedReadoutProps = {
  label: string
  mbps: number
  series: SpeedSeries
}

/** A live rate behind its direction arrow. The digits count up to each new
 *  sample; screen readers get the settled value instead of a mid-count one. */
export function SpeedReadout({ label, mbps, series }: SpeedReadoutProps) {
  const settledMbps = mbps < NOISE_FLOOR_MBPS ? 0 : mbps
  const countingMbps = useCountUp(settledMbps)
  const shown = splitSpeedMbps(countingMbps)
  const settled = splitSpeedMbps(settledMbps)

  return (
    <Readout
      className="min-w-0 flex-1"
      label={label}
      icon={<DirectionIcon series={series} />}
      value={shown.value}
      unit={shown.unit}
      spokenValue={`${settled.value} ${settled.unit}`}
    />
  )
}
