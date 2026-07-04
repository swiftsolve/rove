import { useEffect, useState } from 'react'
import type { DataUsageSummary } from '@/types'
import { createEmptyDataUsage } from '@/types'

const REFRESH_INTERVAL_MS = 10_000

interface UseDataUsageResult {
  readonly usage: DataUsageSummary
  readonly isLoading: boolean
  readonly error: string | null
}

export function useDataUsage(enabled: boolean): UseDataUsageResult {
  const [usage, setUsage] = useState<DataUsageSummary>(createEmptyDataUsage)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    const api = window.networkAPI
    if (!api?.getDataUsage) {
      // No bridge: stop the spinner and say so rather than hang on "Loading…".
      setIsLoading(false)
      setError('Unable to reach the backend for data usage.')
      return
    }

    let disposed = false

    const refresh = async (): Promise<void> => {
      try {
        const summary = await api.getDataUsage()
        if (!disposed) {
          setUsage(summary)
          setError(null)
        }
      } catch {
        // Keep showing the last summary, but surface that the refresh failed.
        if (!disposed) setError('Failed to load data usage.')
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

  return { usage, isLoading, error }
}
