import { useMemo } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { resolveChartScale } from '@/features/live-throughput/utils/chart-scale'
import { inViewHeights } from '@/features/live-throughput/utils/throughput-chart'
import { getLinkCapacityMbps } from '@/types'

/**
 * The live chart's ceiling (Mbps) for these samples, fitted to the line as
 * drawn: the averaged heights in view, bounded by the link's capacity (see
 * resolveChartScale).
 */
export function useThroughputScale(download: number[], upload: number[]): number {
  const { info } = useNetwork()
  const linkCapacityMbps = info ? getLinkCapacityMbps(info) : null
  return useMemo(
    () => resolveChartScale(inViewHeights(download), inViewHeights(upload), { linkCapacityMbps }),
    [download, upload, linkCapacityMbps],
  )
}
