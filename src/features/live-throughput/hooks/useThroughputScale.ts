import { useMemo } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { lastResultOn, resolveChartScale } from '@/features/live-throughput/utils/chart-scale'
import { inViewHeights } from '@/features/live-throughput/utils/throughput-chart'
import { useSpeedHistory } from '@/features/speed/hooks/useSpeedHistory'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { getLinkCapacityMbps } from '@/types'

/**
 * The live chart's ceiling (Mbps) for these samples, fitted to the line as
 * drawn: the averaged heights in view. The link's capacity bounds the scale,
 * and while a test downloads, its last result on this network sets a floor
 * (see resolveChartScale). Upload starting lifts the floor, so the axis eases
 * down to upload's lower rates.
 */
export function useThroughputScale(download: number[], upload: number[]): number {
  const { info } = useNetwork()
  const { entries } = useSpeedHistory()
  const isDownloadTesting = useSpeedTest((test) => test.isTesting && test.livePeakUploadMbps === 0)
  const linkCapacityMbps = info ? getLinkCapacityMbps(info) : null
  const testFloorMbps = isDownloadTesting ? (lastResultOn(entries, info)?.downloadMbps ?? null) : null
  return useMemo(
    () => resolveChartScale(inViewHeights(download), inViewHeights(upload), { linkCapacityMbps, testFloorMbps }),
    [download, upload, linkCapacityMbps, testFloorMbps],
  )
}
