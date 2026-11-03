import { useMemo } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { resolveChartScale } from '@/features/live-throughput/utils/chart-scale'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { getLinkCapacityMbps } from '@/types'

/**
 * The live chart's ceiling (Mbps) for these samples. A running speed test
 * saturates the link, and the link's capacity bounds the scale, so both feed it
 * (see resolveChartScale). Recomputed only when an input changes.
 */
export function useThroughputScale(download: number[], upload: number[]): number {
  const { info } = useNetwork()
  const isSpeedTestRunning = useSpeedTest((test) => test.isTesting)
  const linkCapacityMbps = info ? getLinkCapacityMbps(info) : null
  return useMemo(
    () => resolveChartScale(download, upload, { linkCapacityMbps, isSpeedTestRunning }),
    [download, upload, linkCapacityMbps, isSpeedTestRunning],
  )
}
