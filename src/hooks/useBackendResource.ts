import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** Refetch every time `enabled` turns true (default: fetch only once). */
  readonly refetchOnEnable?: boolean
  /**
   * Cache-invalidation token. When it changes, the cached data/error are
   * discarded and the resource is refetched — pass a value that changes with
   * the network (e.g. interface + IP) so a network switch never serves the
   * previous network's data.
   */
  readonly resetKey?: unknown
}

export interface BackendResource<T> {
  readonly data: T | null
  readonly isBusy: boolean
  readonly error: string | null
  readonly reload: () => Promise<void>
}

/**
 * The shape shared by every "load something from the backend" hook:
 * busy/error state, a manual reload, and an automatic fetch when the
 * owning tab first becomes visible.
 */
export function useBackendResource<T>(
  fetcher: (() => Promise<T>) | undefined,
  enabled: boolean,
  errorMessage: string,
  { refetchOnEnable = false, resetKey }: Options = {},
): BackendResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasRunRef = useRef(false)
  const resetKeyRef = useRef(resetKey)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reloadSeqRef = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const fetch = fetcherRef.current
    if (!fetch) return

    // Guard against overlapping loads resolving out of order: only the latest
    // call is allowed to write state.
    const seq = ++reloadSeqRef.current
    setIsBusy(true)
    setError(null)

    try {
      const result = await fetch()
      if (seq === reloadSeqRef.current) setData(result)
    } catch (cause) {
      if (seq === reloadSeqRef.current) {
        setError(cause instanceof Error ? cause.message : errorMessage)
      }
    } finally {
      if (seq === reloadSeqRef.current) setIsBusy(false)
    }
  }, [errorMessage])

  useEffect(() => {
    // A changed resetKey (e.g. the network switched) invalidates the cache so
    // we never serve the previous network's data.
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      hasRunRef.current = false
      setData(null)
      setError(null)
    }
    if (!enabled) return
    if (!refetchOnEnable && hasRunRef.current) return
    hasRunRef.current = true
    void reload()
  }, [enabled, refetchOnEnable, reload, resetKey])

  return { data, isBusy, error, reload }
}
