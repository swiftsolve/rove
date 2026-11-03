import { type UsageQuery, useUsageQuery } from '@/hooks/useUsageQuery'
import type { DataUsageSummary } from '@/types'
import { createEmptyDataUsage } from '@/types'

// Slower than the per-app breakdowns: the daily totals are a summary.
const REFRESH_INTERVAL_MS = 10_000

const EMPTY_USAGE = createEmptyDataUsage()

/** Download and upload per day for the last week, plus the totals since boot. */
export function useDataUsage(): UsageQuery<DataUsageSummary> {
  return useUsageQuery({
    queryKey: 'dataUsage',
    read: (api) => api.getDataUsage(),
    empty: EMPTY_USAGE,
    errorMessage: 'Couldn’t load data usage',
    isEmpty: (usage) => usage.days.length === 0,
    pollIntervalMs: REFRESH_INTERVAL_MS,
  })
}
