import { type UsageQuery, useUsageQuery } from '@/hooks/useUsageQuery'
import type { DataUsageSummary } from '@/types'

/**
 * Every 2 s, so today's total climbs as traffic moves: the backend adds what's
 * moved since its last 30 s save to it, a cheap counter read.
 */
const POLL_INTERVAL_MS = 2_000

const EMPTY_USAGE: DataUsageSummary = { days: [], bootRxBytes: 0, bootTxBytes: 0, trackingSince: null }

/** Download and upload per day for the last week, plus the totals since boot. */
export function useDataUsage(): UsageQuery<DataUsageSummary> {
  return useUsageQuery({
    queryKey: 'dataUsage',
    read: (api) => api.getDataUsage(),
    emptyUsage: EMPTY_USAGE,
    errorMessage: 'Couldn’t load data usage',
    isEmpty: (usage) => usage.days.length === 0,
    pollIntervalMs: POLL_INTERVAL_MS,
  })
}
