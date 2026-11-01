import { useBackendQuery } from '@/hooks/useBackendQuery'

/**
 * Why per-app usage can't be read, so the "needs administrator" state can show
 * a cause that isn't elevation (a policy block, a provider error). Read each
 * time that state shows; null when there's no reason, or it couldn't be read.
 */
export function useUsageSupportDetail(isEnabled: boolean): string | null {
  const api = window.networkAPI
  const { data, error } = useBackendQuery({
    queryKey: ['apps', 'usage-support-detail'],
    queryFn: api ? () => api.getUsageSupportDetail() : undefined,
    isEnabled,
    errorMessage: 'Failed to read why app usage is unavailable',
  })
  return error == null ? (data ?? null) : null
}
