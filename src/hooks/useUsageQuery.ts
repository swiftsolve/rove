import { useEffect, useEffectEvent } from 'react'

import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { NetworkAPI } from '@/types'

// The per-app breakdowns' poll, faster than the daily summary's: their totals
// climb continuously.
const DEFAULT_POLL_INTERVAL_MS = 5_000
// With a push, the poll is only a safety net for a missed event.
const PUSHED_POLL_INTERVAL_MS = 15_000

type UsageQueryOptions<T> = {
  /** The cache key, one per breakdown. */
  queryKey: string
  /** Reads the breakdown from the backend. */
  read: (api: NetworkAPI) => Promise<T>
  /** What the view shows before the first answer, or with no backend. */
  empty: T
  /** The error text for a failure that isn't an `Error`. */
  errorMessage: string
  /** Whether a breakdown has no rows yet. */
  isEmpty: (usage: T) => boolean
  /** How often to poll while the view is open. */
  pollIntervalMs?: number
  /**
   * Subscribes to the backend's word that new data is in, so the view
   * re-reads as each sample lands rather than on the next poll, which then
   * slows to a safety net. Pass a module-level function, so it subscribes once.
   */
  onUpdate?: (api: NetworkAPI, callback: () => void) => () => void
}

export type UsageQuery<T> = {
  usage: T
  /** The first load or a reload is running; never a background poll. */
  isLoading: boolean
  /**
   * Loading with nothing to show yet: the view shows a spinner rather than an
   * empty list. Later loads keep the rows up.
   */
  isFirstLoad: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * A usage summary or breakdown, polled while its view is open. A missing backend
 * (a plain web build) gives a clear error rather than a hung spinner.
 */
export function useUsageQuery<T>({
  queryKey,
  read,
  empty,
  errorMessage,
  isEmpty,
  onUpdate,
  pollIntervalMs = onUpdate ? PUSHED_POLL_INTERVAL_MS : DEFAULT_POLL_INTERVAL_MS,
}: UsageQueryOptions<T>): UsageQuery<T> {
  const api = window.networkAPI
  const fetchUsage = api ? () => read(api) : undefined

  const { data, isBusy, error, reload, refresh } = useBackendQuery({
    queryKey: [queryKey],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage,
    pollIntervalMs,
  })

  // A quiet re-read, like a poll: no busy state for an update nobody asked for.
  const onPushed = useEffectEvent(() => void refresh())
  useEffect(() => {
    if (!api || !onUpdate) return undefined
    return onUpdate(api, () => onPushed())
  }, [api, onUpdate])

  if (!fetchUsage) {
    return { usage: empty, isLoading: false, isFirstLoad: false, error: 'Can’t reach the app', reload }
  }

  const usage = data ?? empty
  return { usage, isLoading: isBusy, isFirstLoad: isBusy && isEmpty(usage), error, reload }
}
