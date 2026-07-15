import { useCallback, useEffect, useState } from 'react'
import type { ServiceEvent } from '@/types'

interface UseServiceHistoryResult {
  /** The timeline, newest first. Empty until the first read lands. */
  readonly events: readonly ServiceEvent[]
  /** Wipe the stored timeline, then re-read (which yields an empty log). */
  readonly clear: () => Promise<void>
}

/**
 * The services outage timeline, owned by the backend store and recorded by the
 * always-on services heartbeat — so it holds outages that happened while this
 * page, or the whole window, was closed.
 *
 * Re-reads whenever the heartbeat says it folded in a fresh probe, so an outage
 * that starts while the timeline is on screen appears without a manual refresh.
 */
export function useServiceHistory(): UseServiceHistoryResult {
  const [events, setEvents] = useState<readonly ServiceEvent[]>([])

  const read = useCallback(async (): Promise<void> => {
    const history = await window.networkAPI?.getServiceHistory()
    if (history) setEvents(history)
  }, [])

  useEffect(() => {
    void read()
    return window.networkAPI?.onServicesTimeline(() => void read())
  }, [read])

  const clear = useCallback(async (): Promise<void> => {
    await window.networkAPI?.clearServiceHistory()
    await read()
  }, [read])

  return { events, clear }
}
