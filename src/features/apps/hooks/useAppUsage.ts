import { type UsageQuery, useUsageQuery } from '@/hooks/useUsageQuery'
import type { AppUsageSummary, NetworkAPI } from '@/types'

const EMPTY_USAGE: AppUsageSummary = { apps: [], support: 'supported', trackingSince: null }

const onAppUsage = (api: NetworkAPI, callback: () => void): (() => void) => api.onAppUsage(callback)

/** Per-app network usage, busiest first, re-read as each sample lands. */
export function useAppUsage(): UsageQuery<AppUsageSummary> {
  return useUsageQuery({
    queryKey: 'appUsage',
    read: (api) => api.getAppUsage(),
    emptyUsage: EMPTY_USAGE,
    errorMessage: 'Couldn’t load app usage',
    isEmpty: (usage) => usage.apps.length === 0,
    onUpdate: onAppUsage,
  })
}
