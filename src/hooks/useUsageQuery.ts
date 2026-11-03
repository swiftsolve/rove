import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { NetworkAPI } from '@/types'

// The per-app breakdowns' poll, faster than the daily summary's: their totals
// climb continuously.
const DEFAULT_REFRESH_INTERVAL_MS = 5_000

type UsageQueryOptions<T> = {
  /** The cache key, one per breakdown. */
  queryKey: string
  /** Reads the breakdown off the bridge. */
  read: (api: NetworkAPI) => Promise<T>
  /** What the view shows before the first answer, or with no bridge. */
  empty: T
  /** The error text for a failure that isn't an `Error`. */
  errorMessage: string
  /** Whether a breakdown has no rows yet. */
  isEmpty: (usage: T) => boolean
  /** How often to poll while the view is open. */
  pollIntervalMs?: number
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
 * A usage summary or breakdown, polled while its view is open. A missing bridge
 * gives a clear error rather than a hung spinner.
 */
export function useUsageQuery<T>({
  queryKey,
  read,
  empty,
  errorMessage,
  isEmpty,
  pollIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: UsageQueryOptions<T>): UsageQuery<T> {
  const api = window.networkAPI
  const fetchUsage = api ? () => read(api) : undefined

  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: [queryKey],
    queryFn: fetchUsage,
    isEnabled: true,
    errorMessage,
    pollIntervalMs,
  })

  if (!fetchUsage) {
    return { usage: empty, isLoading: false, isFirstLoad: false, error: 'Can’t reach the app', reload }
  }

  const usage = data ?? empty
  return { usage, isLoading: isBusy, isFirstLoad: isBusy && isEmpty(usage), error, reload }
}
