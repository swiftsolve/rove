import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** Refetch every time `enabled` turns true (default: fetch only once). */
  readonly refetchOnEnable?: boolean
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
  { refetchOnEnable = false }: Options = {},
): BackendResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasRunRef = useRef(false)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(async (): Promise<void> => {
    const fetch = fetcherRef.current
    if (!fetch) return

    setIsBusy(true)
    setError(null)

    try {
      setData(await fetch())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errorMessage)
    } finally {
      setIsBusy(false)
    }
  }, [errorMessage])

  useEffect(() => {
    if (!enabled) return
    if (!refetchOnEnable && hasRunRef.current) return
    hasRunRef.current = true
    void reload()
  }, [enabled, refetchOnEnable, reload])

  return { data, isBusy, error, reload }
}
