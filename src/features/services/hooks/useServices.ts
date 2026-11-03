import { useMutation } from '@tanstack/react-query'

import { queryClient } from '@/app/utils/query-client'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { ServiceDefinition } from '@/types'

const SERVICES_KEY = ['services', 'list']

type UseServicesResult = {
  /** The user's ordered service list, or null before the first load resolves. */
  services: ServiceDefinition[] | null
  error: string | null
  /** Add a service and adopt the returned list. Rejects on failure, so the dialog that asked can say so. */
  add: (name: string, host: string) => Promise<void>
  /** Edit the service listed under `oldHost` in place and adopt the returned list. Rejects like `add`. */
  update: (oldHost: string, name: string, host: string) => Promise<void>
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
 * The editable service list, owned by the backend store. Only this app edits it,
 * so it loads once and stays cached. Each edit caches the authoritative list the
 * backend returns, so the list updates without waiting for the next poll.
 * Latency comes from the probes, matched to rows by host in the view.
 */
export function useServices(): UseServicesResult {
  const api = window.networkAPI
  const { data, error } = useBackendQuery({
    queryKey: SERVICES_KEY,
    queryFn: api ? () => api.listServices() : undefined,
    isEnabled: true,
    errorMessage: 'Failed to load services',
    freshForMs: Infinity,
  })

  const addMutation = useMutation({
    mutationFn: async ({ name, host }: { name: string; host: string }) => api?.addService(name, host),
    onSuccess: adoptList,
  })
  const updateMutation = useMutation({
    mutationFn: async ({ oldHost, name, host }: { oldHost: string; name: string; host: string }) =>
      api?.updateService(oldHost, name, host),
    onSuccess: adoptList,
  })
  const removeMutation = useMutation({
    mutationFn: async (host: string) => api?.deleteService(host),
    onSuccess: adoptList,
  })

  const add = async (name: string, host: string): Promise<void> => {
    updateMutation.reset()
    removeMutation.reset()
    await addMutation.mutateAsync({ name, host })
  }
  const update = async (oldHost: string, name: string, host: string): Promise<void> => {
    addMutation.reset()
    removeMutation.reset()
    await updateMutation.mutateAsync({ oldHost, name, host })
  }
  const remove = async (host: string): Promise<void> => {
    addMutation.reset()
    updateMutation.reset()
    await removeMutation.mutateAsync(host).catch(() => undefined)
  }

  // An add or edit reports its failure in its dialog; only a remove has no
  // dialog to do it, so its failure shows in `error`.
  const mutationError = errorText(removeMutation.error, 'Failed to remove service')

  return { services: data ?? null, error: mutationError ?? error, add, update, remove }
}
