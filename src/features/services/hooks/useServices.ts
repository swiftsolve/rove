import { useMutation } from '@tanstack/react-query'
import type { ServiceDefinition } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import { queryClient } from '@/app/utils/query-client'

const SERVICES_KEY = ['services', 'list']

interface UseServicesResult {
  /** The user's ordered service list, or null before the first load resolves. */
  services: ServiceDefinition[] | null
  error: string | null
  /** Add a service and adopt the returned list. Never rejects: a failure shows in `error`. */
  add: (name: string, host: string) => Promise<void>
  /** Remove the service with this host and adopt the returned list. Never rejects. */
  remove: (host: string) => Promise<void>
}

function errorText(error: Error | null, fallback: string): string | null {
  if (error == null) return null
  return error.message || fallback
}

function adoptList(list: ServiceDefinition[] | undefined): void {
  if (list) queryClient.setQueryData(SERVICES_KEY, list)
}

/**
 * The editable reachability service list (built-in defaults + user additions,
 * minus removals), owned by the backend store. Only this app edits it, so it
 * loads once and stays cached: a return to Services shows it at once. Add and
 * remove persist through the bridge and put the authoritative list they return
 * into the cache, so the list updates without waiting for the next services poll.
 *
 * Latency is deliberately NOT here — it comes from the services probes and is
 * matched to these rows by host in the view.
 */
export function useServices(): UseServicesResult {
  const api = window.networkAPI
  const { data, error } = useBackendQuery({
    queryKey: SERVICES_KEY,
    queryFn: api ? () => api.listServices() : undefined,
    isEnabled: true,
    errorMessage: 'Failed to load services',
    shouldRefetchOnOpen: false,
  })

  const addMutation = useMutation({
    mutationFn: async ({ name, host }: { name: string; host: string }) => api?.addService(name, host),
    onSuccess: adoptList,
  })
  const removeMutation = useMutation({
    mutationFn: async (host: string) => api?.deleteService(host),
    onSuccess: adoptList,
  })

  const add = async (name: string, host: string): Promise<void> => {
    removeMutation.reset()
    await addMutation.mutateAsync({ name, host }).catch(() => undefined)
  }
  const remove = async (host: string): Promise<void> => {
    addMutation.reset()
    await removeMutation.mutateAsync(host).catch(() => undefined)
  }

  const mutationError =
    errorText(addMutation.error, 'Failed to add service') ??
    errorText(removeMutation.error, 'Failed to remove service')

  return { services: data ?? null, error: mutationError ?? error, add, remove }
}
