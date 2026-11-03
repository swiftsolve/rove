import { type UsageQuery, useUsageQuery } from '@/hooks/useUsageQuery'
import type { TrafficUsageSummary } from '@/types'
import { createEmptyTrafficUsage } from '@/types'

const EMPTY_USAGE = createEmptyTrafficUsage()

/**
 * Session traffic bucketed by kind (protocol). Reads off the same backend
 * tracker the Hosts view does, so there's no extra sampling.
 */
export function useTrafficUsage(): UsageQuery<TrafficUsageSummary> {
  return useUsageQuery({
    queryKey: 'trafficUsage',
    read: (api) => api.getTrafficUsage(),
    empty: EMPTY_USAGE,
    errorMessage: 'Couldn’t load traffic types',
    isEmpty: (usage) => usage.types.length === 0,
  })
}
