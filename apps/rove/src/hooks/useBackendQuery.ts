import { hashKey, type QueryKey, skipToken, useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

export type BackendQueryOptions<T> = {
  /** Names the data in the shared cache. Every caller with the same key shares one entry. */
  queryKey: QueryKey
  /** Reads the data. Undefined when there is no backend bridge: then nothing fetches. */
  queryFn: (() => Promise<T>) | undefined
  /** True while a screen that shows this data is open. A closed query keeps its data but doesn't fetch. */
  isEnabled: boolean
  /** The error text for a failure that isn't an `Error`. */
  errorMessage: string
  /**
   * How long a result stays current: a screen that opens within it shows it
   * without refetching. Defaults to the poll interval, else 10s; `Infinity`
   * fetches only when nothing is cached.
   */
  freshForMs?: number
  /** Poll in the background at this interval while open and the window is visible. */
  pollIntervalMs?: number
  /**
   * Drop the data once no screen shows it, rather than keep it for the app's
   * lifetime (default false). For data that shouldn't linger, like a password.
   */
  shouldForgetWhenClosed?: boolean
}

export type BackendQuery<T> = {
  data: T | undefined
  /** A first load, an open-time refetch or a manual reload is running. Never a background poll. */
  isBusy: boolean
  /** Null during the opening fetch; a reload over data keeps it until the reload lands. */
  error: string | null
  /** Fetch now and show the busy state, cancelling any background poll in flight. */
  reload: () => Promise<void>
  /** Fetch now quietly, like a poll, joining any fetch in flight. For a nudge the user didn't ask for. */
  refresh: () => Promise<void>
  /** When `data` last landed, in ms since the epoch; 0 before it has. */
  dataUpdatedAt: number
}

/**
 * How long a result counts as current when nothing polls it: a screen that
 * opens within this, like the next one in a Home → Devices swap, reuses it.
 */
const DEFAULT_FRESH_FOR_MS = 10_000

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * `useQuery` for a backend read, with the app's open/poll/busy rules:
 *
 * - **Open.** Fetches when a screen showing it opens on data older than
 *   `freshForMs`, so a swap between two such screens doesn't refetch.
 * - **Poll.** With `pollIntervalMs`, refetches quietly while open and visible.
 * - **Busy.** `isBusy` covers the first load, the open-time refetch and
 *   `reload()`, never a poll. `error` reads null during the opening fetch, so
 *   an old error doesn't flash up; a failed poll keeps the last data.
 */
export function useBackendQuery<T>({
  queryKey,
  queryFn,
  isEnabled,
  errorMessage,
  pollIntervalMs,
  freshForMs = pollIntervalMs ?? DEFAULT_FRESH_FOR_MS,
  shouldForgetWhenClosed = false,
}: BackendQueryOptions<T>): BackendQuery<T> {
  const canFetch = queryFn !== undefined
  // The key whose opening fetch is over (or never ran, on current data). Until
  // then a fetch is the opening one, and busy; after it, one is a poll.
  const [openedHash, setOpenedHash] = useState<string | null>(null)
  const queryHash = hashKey(queryKey)
  const isOpened = openedHash === queryHash
  // StrictMode can't double-fetch: its dev remount joins the mount's fetch in flight.
  const query = useQuery({
    queryKey,
    queryFn: queryFn ?? skipToken,
    enabled: isEnabled,
    staleTime: freshForMs,
    refetchInterval: pollIntervalMs ?? false,
    ...(shouldForgetWhenClosed && { gcTime: 0 }),
    refetchOnWindowFocus: pollIntervalMs ? 'always' : false,
    // Once open, a poll re-renders only when its data or error changes, not as
    // it starts and ends.
    notifyOnChangeProps: isOpened ? ['data', 'error'] : ['data', 'error', 'isFetching', 'isFetchedAfterMount'],
  })
  const { data, dataUpdatedAt, isFetching, isFetchedAfterMount, refetch } = query
  // On the first render TanStack already reports the fetch it will start, so a
  // screen that renders not fetching opened on current data.
  const isOpeningOver = isFetchedAfterMount || !isFetching
  if (isEnabled && canFetch && isOpeningOver && !isOpened) setOpenedHash(queryHash)

  // Manual reloads in flight. Each caller counts its own: only its screen shows them.
  const [reloadCount, setReloadCount] = useState(0)
  const reload = useCallback(async (): Promise<void> => {
    if (!canFetch) return
    setReloadCount((count) => count + 1)
    try {
      await refetch()
    } finally {
      setReloadCount((count) => count - 1)
    }
  }, [canFetch, refetch])

  const refresh = useCallback(async (): Promise<void> => {
    if (canFetch) await refetch({ cancelRefetch: false })
  }, [canFetch, refetch])

  const isOpeningFetch = isFetching && !isOpened
  const isBusy = isOpeningFetch || reloadCount > 0
  const error = isOpeningFetch || query.error == null ? null : errorText(query.error, errorMessage)

  return { data, isBusy, error, reload, refresh, dataUpdatedAt }
}
