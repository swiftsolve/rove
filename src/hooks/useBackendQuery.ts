import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hashKey, skipToken, useQuery, type QueryKey } from '@tanstack/react-query'

interface BackendQueryOptions<T> {
  /** Names the data in the shared cache. Every caller with the same key shares one entry. */
  queryKey: QueryKey
  /** Reads the data. Undefined when there is no backend bridge: then nothing fetches. */
  queryFn: (() => Promise<T>) | undefined
  /** True while a screen that shows this data is open. A closed query keeps its data but doesn't fetch. */
  isEnabled: boolean
  /** The error text for a failure that isn't an `Error`. */
  errorMessage: string
  /** Fetch again each time the data's screen opens (default true). False fetches only when nothing is cached. */
  shouldRefetchOnOpen?: boolean
  /** Poll in the background at this interval while open and the window is visible. */
  pollIntervalMs?: number
  /** Drop the data once no screen shows it, rather than keep it for the app's
   *  lifetime (default false). For data that shouldn't linger, like a password. */
  shouldForgetWhenClosed?: boolean
}

export interface BackendQuery<T> {
  data: T | undefined
  /** A first load, an open-time refetch or a manual reload is running. Never a background poll. */
  isBusy: boolean
  /** Null during the opening fetch; a reload keeps it until the reload lands. */
  error: string | null
  /** Fetch now and show the busy state, cancelling any background poll in flight. */
  reload: () => Promise<void>
}

// How many mounted, enabled callers hold each query open, by query hash.
const openCounts = new Map<string, number>()

/** Holds a query open. Returns whether it was already open. */
function holdOpen(queryHash: string): boolean {
  const count = openCounts.get(queryHash)
  openCounts.set(queryHash, (count ?? 0) + 1)
  return count !== undefined
}

function releaseOpen(queryHash: string): void {
  const count = (openCounts.get(queryHash) ?? 1) - 1
  openCounts.set(queryHash, count)
  if (count > 0) return
  // Close it only if nothing reopens it in this commit. Moving between two
  // screens that show the same data (Home ↔ Devices, Services ↔ its timeline)
  // unmounts one caller and mounts the next in a single commit, so the query
  // stays open and doesn't refetch. StrictMode's dev remount also lands inside
  // it. The microtask runs once that commit's effects have all run.
  queueMicrotask(() => {
    if (openCounts.get(queryHash) === 0) openCounts.delete(queryHash)
  })
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * `useQuery` for a backend read, with the app's open/poll/busy rules:
 *
 * - **Open.** The query fetches when a screen that shows it opens, unless
 *   another such screen was open just before. It doesn't fetch again when one
 *   of those screens is swapped for another.
 * - **Poll.** With `pollIntervalMs` it refetches quietly while open. TanStack
 *   pauses the poll while the window is hidden and reads once when it's shown.
 * - **Busy.** `isBusy` is true for the first load, the open-time refetch and a
 *   manual `reload()`, never for a poll. During the opening fetch `error` reads
 *   null, so an error from a visit before doesn't flash up. A reload keeps the
 *   current error until it lands, so the banner that offered Retry can show it
 *   running. A failed poll keeps the last data and reports its error.
 *
 * StrictMode can't double-fetch: TanStack shares one in-flight fetch between
 * the mount and the dev remount, and busy comes from the query's own state,
 * so no spinner can be left behind.
 */
export function useBackendQuery<T>({
  queryKey,
  queryFn,
  isEnabled,
  errorMessage,
  shouldRefetchOnOpen = true,
  pollIntervalMs,
  shouldForgetWhenClosed = false,
}: BackendQueryOptions<T>): BackendQuery<T> {
  const canFetch = queryFn !== undefined
  // Whether this screen's opening fetch has landed, as of its last commit.
  const isOpenedRef = useRef(false)
  const query = useQuery({
    queryKey,
    queryFn: queryFn ?? skipToken,
    enabled: isEnabled,
    // The open-time refetch is ours (below), so it skips a screen swap.
    refetchOnMount: false,
    refetchInterval: pollIntervalMs ?? false,
    ...(shouldForgetWhenClosed && { gcTime: 0 }),
    refetchOnWindowFocus: pollIntervalMs ? 'always' : false,
    // `isFetching` only matters until the opening fetch lands (it drives
    // `isBusy`). After that, a poll re-renders the screen only when its data or
    // error changes, not once as it starts and again as it ends.
    notifyOnChangeProps: () =>
      isOpenedRef.current ? ['data', 'error'] : ['data', 'error', 'isFetching', 'isFetchedAfterMount'],
  })
  const { data, isFetching, isFetchedAfterMount, refetch } = query
  useLayoutEffect(() => {
    isOpenedRef.current = isFetchedAfterMount
  })

  const queryHash = hashKey(queryKey)
  useEffect(() => {
    if (!isEnabled || !canFetch) return
    const wasOpen = holdOpen(queryHash)
    // Join a fetch already in flight rather than cancelling it, so this never
    // adds a second call on top of TanStack's own first load.
    if (shouldRefetchOnOpen && !wasOpen) void refetch({ cancelRefetch: false })
    return () => releaseOpen(queryHash)
  }, [isEnabled, canFetch, queryHash, shouldRefetchOnOpen, refetch])

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

  // The first fetch since this screen mounted is the first load or the
  // open-time refetch. Any later one without a reload is a poll.
  const isOpeningFetch = isFetching && !isFetchedAfterMount
  const isBusy = isOpeningFetch || reloadCount > 0
  const error = isOpeningFetch || query.error == null ? null : errorText(query.error, errorMessage)

  return { data, isBusy, error, reload }
}
