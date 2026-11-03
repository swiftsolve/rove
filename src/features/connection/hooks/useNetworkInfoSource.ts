import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { queryClient } from '@/app/utils/query-client'
import { getNetworkApi, NO_BRIDGE_MESSAGE } from '@/bridge/network-api'
import { isNetworkInfoEqual } from '@/features/connection/utils/network-info-equal'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'
import { usePageVisible } from '@/hooks/usePageVisible'
import type { NetworkInfo } from '@/types'

const NETWORK_INFO_KEY = ['network', 'info']

const REFRESH_INTERVAL_MS = 15_000
// Above the backend's 15s per-command budget (crates/rove-core/src/util/shell.rs),
// so a slow but healthy probe never trips an error here first.
const NETWORK_INFO_TIMEOUT_MS = 20_000
// Failed reads in a row before the error shows over a good reading, one poll
// apart; until then the last good reading stays on screen.
const FAILURES_BEFORE_ERROR = 3

/**
 * Why the network can't be read. `timeout`: the OS query is slow, which is
 * usually temporary. `backend`: there's no bridge to the app. `offline`: the
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
  const hasBridge = window.networkAPI !== undefined
  const query = useQuery({
    queryKey: NETWORK_INFO_KEY,
    queryFn: readNetworkInfo,
    enabled: hasBridge,
    refetchInterval: REFRESH_INTERVAL_MS,
    // A failed poll over a good reading tries again a poll later, so the error
    // shows only once FAILURES_BEFORE_ERROR reads in a row have failed. The
    // first read has nothing to fall back on, so it reports at once.
    retry: (failureCount) =>
      queryClient.getQueryData(NETWORK_INFO_KEY) !== undefined && failureCount < FAILURES_BEFORE_ERROR - 1,
    retryDelay: REFRESH_INTERVAL_MS,
    // An unchanged reading keeps its identity, so readers don't re-render.
    structuralSharing: (previous, next) =>
      isNetworkInfoEqual((previous as NetworkInfo | undefined) ?? null, next as NetworkInfo) ? previous : next,
    // Not `dataUpdatedAt` or `isFetching`: a quiet poll that changes nothing
    // re-renders nothing.
    notifyOnChangeProps: ['data', 'error', 'status'],
  })
  const { data, dataUpdatedAt, refetch, status } = query
  const queryError = query.error

  // Reads the user asked for (or a resume) in flight: they show the spinner
  // while there's no reading yet. A poll or nudge never does.
  const [reloadCount, setReloadCount] = useState(0)
  const reload = useCallback(async (): Promise<void> => {
    if (!hasBridge) return
    setReloadCount((count) => count + 1)
    try {
      // Drops a read in flight rather than join it: after the window resumes
      // from the background, that's a frozen read whose timeout fires at once.
      await queryClient.cancelQueries({ queryKey: NETWORK_INFO_KEY })
      await refetch()
    } finally {
      setReloadCount((count) => count - 1)
    }
  }, [hasBridge, refetch])

  const isVisible = usePageVisible()
  const wasVisibleRef = useRef(isVisible)
  useEffect(() => {
    // The first read is TanStack's own; this is each resume after it.
    const wasVisible = wasVisibleRef.current
    wasVisibleRef.current = isVisible
    if (isVisible && !wasVisible) void reload()
  }, [isVisible, reload])

  useOnNetworkChanged(() => void refetch({ cancelRefetch: false }), hasBridge)

  const info = data ?? null
  const error = useMemo<NetworkError | null>(() => {
    if (!hasBridge) return { kind: 'backend', message: NO_BRIDGE_MESSAGE }
    return queryError ? toNetworkError(queryError) : null
  }, [hasBridge, queryError])
  const lastReadAt = error && dataUpdatedAt > 0 ? dataUpdatedAt : null
  const isLoading = hasBridge && info === null && (status === 'pending' || reloadCount > 0)

  return useMemo(
    () => ({ info, error, lastReadAt, isLoading, refresh: reload }),
    [info, error, lastReadAt, isLoading, reload],
  )
}
