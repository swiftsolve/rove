import { type UsageQuery, useUsageQuery } from '@/features/apps/hooks/useUsageQuery'
import type { AppUsageSummary } from '@/types'
import { createEmptyAppUsage } from '@/types'

const EMPTY_USAGE = createEmptyAppUsage()

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
