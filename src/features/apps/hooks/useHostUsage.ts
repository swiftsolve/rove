import type { HostUsageSummary } from '@/types'
import { createEmptyHostUsage } from '@/types'
import { useUsageQuery, type UsageQuery } from '@/features/apps/hooks/useUsageQuery'

const EMPTY_USAGE = createEmptyHostUsage()

/** Per-app remote-host breakdown. Hostnames and country flags fill in over the
 *  first few polls as the backend resolves them. */
export function useHostUsage(): UsageQuery<HostUsageSummary> {
  return useUsageQuery({
    queryKey: 'hostUsage',
    read: (api) => api.getHostUsage(),
    empty: EMPTY_USAGE,
    errorMessage: 'Couldn’t load hosts',
    isEmpty: (usage) => usage.apps.length === 0,
  })
}
