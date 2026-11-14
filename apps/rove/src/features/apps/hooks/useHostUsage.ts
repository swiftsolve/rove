import { type UsageQuery, useUsageQuery } from '@/hooks/useUsageQuery'
import type { HostUsageSummary, NetworkAPI } from '@/types'

const EMPTY_USAGE: HostUsageSummary = { apps: [], support: 'supported', trackingSince: null }

const onHostUsage = (api: NetworkAPI, callback: () => void): (() => void) => api.onHostUsage(callback)

/**
 * Per-app remote-host breakdown, re-read as each host sample lands. Hostnames and country flags fill in over the
 * first few polls as the backend resolves them.
 */
export function useHostUsage(): UsageQuery<HostUsageSummary> {
  return useUsageQuery({
    queryKey: 'hostUsage',
    read: (api) => api.getHostUsage(),
    emptyUsage: EMPTY_USAGE,
    errorMessage: 'Couldn’t load hosts',
    isEmpty: (usage) => usage.apps.length === 0,
    onUpdate: onHostUsage,
  })
}
