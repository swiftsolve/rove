import { useCallback, useEffect, useState } from 'react'
import type { ServiceDefinition } from '@/types'

interface UseServicesResult {
  /** The user's ordered service list, or null before the first load resolves. */
  readonly services: readonly ServiceDefinition[] | null
  readonly error: string | null
  /** Add a service and adopt the returned list. */
  readonly add: (name: string, host: string) => Promise<void>
  /** Remove the service with this host and adopt the returned list. */
  readonly remove: (host: string) => Promise<void>
}

/**
 * The editable reachability service list (built-in defaults + user additions,
 * minus removals), owned by the backend store. Loads once on enable; add/remove
 * persist through the bridge and adopt the authoritative list it returns, so the
 * card updates immediately without waiting for the next diagnostics poll.
 *
 * Latency is deliberately NOT here — it comes from the diagnostics probes and is
 * matched to these rows by host in the view.
 */
export function useServices(enabled: boolean): UseServicesResult {
  const [services, setServices] = useState<readonly ServiceDefinition[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      try {
        const list = await window.networkAPI?.listServices()
        if (!cancelled && list) setServices(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load services')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  const add = useCallback(async (name: string, host: string) => {
    setError(null)
    try {
      const list = await window.networkAPI?.addService(name, host)
      if (list) setServices(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add service')
    }
  }, [])

  const remove = useCallback(async (host: string) => {
    setError(null)
    try {
      const list = await window.networkAPI?.deleteService(host)
      if (list) setServices(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove service')
    }
  }, [])

  return { services, error, add, remove }
}
