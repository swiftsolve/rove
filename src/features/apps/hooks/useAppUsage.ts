import { type UsageQuery, useUsageQuery } from '@/hooks/useUsageQuery'
import type { AppUsageSummary } from '@/types'

const EMPTY_USAGE: AppUsageSummary = { apps: [], support: 'supported', trackingSince: null }

/** Per-app network usage, busiest first. */
export function useAppUsage(): UsageQuery<AppUsageSummary> {
  return useUsageQuery({
    queryKey: 'appUsage',
    read: (api) => api.getAppUsage(),
    empty: EMPTY_USAGE,
    errorMessage: 'Couldn’t load app usage',
    isEmpty: (usage) => usage.apps.length === 0,
  })
}
