import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { isNetworkInfoEqual } from '@/app/utils/network-info-equal'
import { queryClient } from '@/app/utils/query-client'
import { getNetworkApi, NO_BACKEND_MESSAGE } from '@/bridge/network-api'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'
import { usePageVisible } from '@/hooks/usePageVisible'
import type { NetworkInfo } from '@/types'

const NETWORK_INFO_KEY = ['network', 'info']

const REFRESH_INTERVAL_MS = 15_000
/**
 * Above the backend's 15s per-command budget (crates/rove-core/src/utils/shell.rs),
 * so a slow but healthy probe never trips an error here first.
 */
const NETWORK_INFO_TIMEOUT_MS = 20_000
/**
 * Failed reads in a row before the error shows over a good reading, one poll
 * apart; until then the last good reading stays on screen.
 */
const FAILURES_BEFORE_ERROR = 3

/**
 * Why the network can't be read. `timeout`: the OS query is slow, which is
 * usually temporary. `backend`: there's no backend (a plain web build). `offline`: the
 * read failed, with the backend's reason as `message`.
 */
export type NetworkError = {
  kind: 'timeout' | 'backend' | 'offline'
  message: string
}

/** The local link (Wi-Fi / Ethernet): `info` is null until the first read lands. */
export type NetworkState = {
  info: NetworkInfo | null
  error: NetworkError | null
  /**
   * When the last good reading landed, as of the latest error: the age of the
   * `info` an error banner sits over. Null while there's no error, so a
   * successful poll doesn't re-render every reader.
   */
  lastReadAt: number | null
  isLoading: boolean
  refresh: () => Promise<void>
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new TimeoutError(message)), timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

function readNetworkInfo(): Promise<NetworkInfo> {
  return withTimeout(getNetworkApi().getNetworkInfo(), NETWORK_INFO_TIMEOUT_MS, 'Network detection timed out.')
}

function toNetworkError(error: Error): NetworkError {
  return {
    kind: error instanceof TimeoutError ? 'timeout' : 'offline',
    message: error.message || 'Failed to read network information',
  }
}

/**
 * Creates the app's network state: reads network info on mount, polls it while
 * the window is visible and refreshes on the backend's network-changed nudge.
 * Called once, by `NetworkProvider`; components read it with `useNetwork()`.
 */
export function useNetworkInfoSource(): NetworkState {
  // Missing in a plain web build, or a test that installs no fake.
  const hasBackend = window.networkAPI !== undefined
  const query = useQuery({
    queryKey: NETWORK_INFO_KEY,
    queryFn: readNetworkInfo,
    enabled: hasBackend,
    refetchInterval: REFRESH_INTERVAL_MS,
    // A failed read over a good reading retries a poll later, so the error
    // shows only after FAILURES_BEFORE_ERROR failures in a row. The first read
    // has nothing to fall back on, so it reports at once.
    retry: (failureCount) =>
      queryClient.getQueryData(NETWORK_INFO_KEY) !== undefined && failureCount < FAILURES_BEFORE_ERROR - 1,
    retryDelay: REFRESH_INTERVAL_MS,
    // An unchanged reading keeps its identity, so readers don't re-render.
    structuralSharing: (previous, next) =>
      isNetworkInfoEqual((previous as NetworkInfo | undefined) ?? null, next as NetworkInfo) ? previous : next,
    // Not `dataUpdatedAt` or `isFetching`: a poll that changes nothing
    // re-renders nothing. `lastReadAt` still reads `dataUpdatedAt` fresh, on
    // the render the error brings.
    notifyOnChangeProps: ['data', 'error', 'status'],
  })
  const { data, dataUpdatedAt, refetch, status } = query
  const queryError = query.error

  // Reloads in flight (Retry, or a resume). Until the first reading lands they
  // show the spinner; a poll or nudge never does.
  const [reloadCount, setReloadCount] = useState(0)
  const reload = useCallback(async (): Promise<void> => {
    if (!hasBackend) return
    setReloadCount((count) => count + 1)
    try {
      // Drops a read in flight rather than join it: after the window resumes
      // from the background, that's a frozen read whose timeout fires at once.
      await queryClient.cancelQueries({ queryKey: NETWORK_INFO_KEY })
      await refetch()
    } finally {
      setReloadCount((count) => count - 1)
    }
  }, [hasBackend, refetch])

  const isVisible = usePageVisible()
  const wasVisibleRef = useRef(isVisible)
  useEffect(() => {
    // Each resume reads afresh, here rather than through TanStack's focus
    // refetch, which would join the frozen read. The first read is TanStack's own.
    const wasVisible = wasVisibleRef.current
    wasVisibleRef.current = isVisible
    if (isVisible && !wasVisible) void reload()
  }, [isVisible, reload])

  useOnNetworkChanged(() => void refetch({ cancelRefetch: false }), hasBackend)

  const info = data ?? null
  const error = useMemo<NetworkError | null>(() => {
    if (!hasBackend) return { kind: 'backend', message: NO_BACKEND_MESSAGE }
    return queryError ? toNetworkError(queryError) : null
  }, [hasBackend, queryError])
  const lastReadAt = error && dataUpdatedAt > 0 ? dataUpdatedAt : null
  const isLoading = hasBackend && info === null && (status === 'pending' || reloadCount > 0)

  return useMemo(
    () => ({ info, error, lastReadAt, isLoading, refresh: reload }),
    [info, error, lastReadAt, isLoading, reload],
  )
}
