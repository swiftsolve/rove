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
    // we never serve the previous network's data. The initial transition from
    // "no key yet" to the first real key is NOT a switch — it's the key merely
    // becoming known (network info finishing loading just after the first fetch
    // already kicked off) — so it must not clear state or force a redundant
    // refetch. Only a change between two known keys is a real invalidation.
    if (resetKeyRef.current !== resetKey) {
      const hadPreviousKey = resetKeyRef.current != null
      resetKeyRef.current = resetKey
      if (hadPreviousKey) {
        hasRunRef.current = false
        setData(null)
        setError(null)
      }
    }
    if (!enabled) return
    if (!refetchOnEnable && hasRunRef.current) return
    hasRunRef.current = true
    void reload()
  }, [enabled, refetchOnEnable, reload, resetKey])

  useEffect(() => {
    // Drop any in-flight fetch on unmount so it can't setState afterward. This
    // must NOT run on every resetKey/enabled change: when the key merely becomes
    // known (null → first real key) we deliberately keep the initial fetch in
    // flight instead of refetching, so invalidating its sequence here would
    // orphan it — its result would be discarded and `isBusy` would never clear,
    // leaving the view stuck on its spinner. A real network switch or an
    // overlapping reload is already superseded by reload()'s own sequence bump.
    return () => {
      reloadSeqRef.current += 1
    }
  }, [])

  return { data, isBusy, error, reload }
}
