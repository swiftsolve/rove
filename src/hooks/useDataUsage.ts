import { useEffect, useState } from 'react'
import type { DataUsageSummary } from '@shared/types'
import { createEmptyDataUsage } from '@shared/types'

const REFRESH_INTERVAL_MS = 10_000

interface UseDataUsageResult {
  readonly usage: DataUsageSummary
  readonly isLoading: boolean
}

export function useDataUsage(enabled: boolean): UseDataUsageResult {
  const [usage, setUsage] = useState<DataUsageSummary>(createEmptyDataUsage)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!enabled || !window.networkAPI?.getDataUsage) return

    let disposed = false

    const refresh = async (): Promise<void> => {
      try {
        const summary = await window.networkAPI.getDataUsage()
        if (!disposed) setUsage(summary)
      } catch {
        // Keep showing the last summary.
      } finally {
        if (!disposed) setIsLoading(false)
      }
    }

    void refresh()
    const intervalId = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)

    return () => {
      disposed = true
      clearInterval(intervalId)
    }
  }, [enabled])

  return { usage, isLoading }
}
