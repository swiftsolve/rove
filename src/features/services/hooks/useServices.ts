import { useCallback, useEffect, useState } from 'react'
import type { ServiceDefinition } from '@/types'

interface UseServicesResult {
  /** The user's ordered service list, or null before the first load resolves. */
  services: ServiceDefinition[] | null
  error: string | null
  /** Add a service and adopt the returned list. */
  add: (name: string, host: string) => Promise<void>
  /** Remove the service with this host and adopt the returned list. */
  remove: (host: string) => Promise<void>
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

/**
 * The editable reachability service list (built-in defaults + user additions,
 * minus removals), owned by the backend store. Loads once on enable; add/remove
 * persist through the bridge and adopt the authoritative list it returns, so the
 * list updates immediately without waiting for the next services poll.
 *
 * Latency is deliberately NOT here — it comes from the services probes and is
 * matched to these rows by host in the view.
 */
export function useServices(isEnabled: boolean): UseServicesResult {
  const [services, setServices] = useState<ServiceDefinition[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEnabled) return
    let isCancelled = false
    void (async () => {
      try {
        const list = await window.networkAPI?.listServices()
        if (!isCancelled && list) setServices(list)
      } catch (e) {
        if (!isCancelled) setError(errorMessage(e, 'Failed to load services'))
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [isEnabled])

  const add = useCallback(async (name: string, host: string) => {
    setError(null)
    try {
      const list = await window.networkAPI?.addService(name, host)
      if (list) setServices(list)
    } catch (e) {
      setError(errorMessage(e, 'Failed to add service'))
    }
  }, [])

  const remove = useCallback(async (host: string) => {
    setError(null)
    try {
      const list = await window.networkAPI?.deleteService(host)
      if (list) setServices(list)
    } catch (e) {
      setError(errorMessage(e, 'Failed to remove service'))
    }
  }, [])

  return { services, error, add, remove }
}
