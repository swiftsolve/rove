import { useBackendQuery } from '@/hooks/useBackendQuery'
import { queryClient } from '@/app/utils/query-client'
import { clearSpeedHistory, getSpeedHistory, type SpeedHistoryEntry } from '@/features/speed/utils/speed-history'

/** The history's cache entry. A finished test invalidates it once its result is saved. */
export const SPEED_HISTORY_KEY = ['speed', 'history']

type SpeedHistory = {
  /** Past results, newest first; undefined until the first read lands. */
  entries: SpeedHistoryEntry[] | undefined
  /** Delete every result. */
  clear: () => void
}

/**
 * Past speed-test results, read each time the history page opens. A test that
 * finishes while the page is open shows up without a refresh: saving its
 * result invalidates this query (see `useSpeedTest`).
 */
export function useSpeedHistory(): SpeedHistory {
  const { data } = useBackendQuery({
    queryKey: SPEED_HISTORY_KEY,
    // Never rejects: a failed read is an empty history.
    queryFn: getSpeedHistory,
    isEnabled: true,
    errorMessage: 'Failed to load speed history',
  })

  const clear = (): void => {
    // Empty at once, and not refilled by a read that started before the clear.
    void queryClient.cancelQueries({ queryKey: SPEED_HISTORY_KEY })
    queryClient.setQueryData<SpeedHistoryEntry[]>(SPEED_HISTORY_KEY, [])
    void clearSpeedHistory()
  }

  return { entries: data, clear }
}
