import { useCallback, useEffect, useRef, useState } from 'react'
import { usePageVisible } from '@/hooks/usePageVisible'

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
  /**
   * While `enabled`, silently refetch on this interval (ms) so on-screen values
   * stay live without the user hitting refresh. Omit to fetch only on
   * enable/reset. The poll is a background refresh — it never toggles `isBusy`.
   */
  readonly pollIntervalMs?: number
  /**
   * Fire the automatic fetch when `enabled`/`resetKey` first turn on? Default
   * true. Set false for a poll-only resource whose initial value is seeded
   * elsewhere (e.g. a "live metrics" overlay seeded by a sibling full snapshot):
   * it then fetches only on its poll interval and on visibility-resume, so it
   * never adds a second probe of the same targets on open.
   */
  readonly fetchOnEnable?: boolean
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
  { refetchOnEnable = false, resetKey, pollIntervalMs, fetchOnEnable = true }: Options = {},
): BackendResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasRunRef = useRef(false)
  const resetKeyRef = useRef(resetKey)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reloadSeqRef = useRef(0)
  // Seq of the latest non-silent reload — the one that owns the busy flag. A
  // silent poll bumps reloadSeqRef (data ordering) but must not steal busy
  // ownership, or a manual reload it overlaps would never clear its spinner.
  const busySeqRef = useRef(0)
  // Liveness, kept separate from `reloadSeqRef` (which only orders overlapping
  // loads). Conflating the two is what previously orphaned the initial fetch
  // under React 18 StrictMode: its simulated unmount bumped the sequence, the
  // remount was skipped by the `hasRunRef` guard, and the in-flight result was
  // then dropped — so `isBusy` never cleared and the spinner hung forever.
  const mountedRef = useRef(true)

  // Pause polling while the app is backgrounded; refresh once on resume. Without
  // this, the webview's throttled interval wakes up and fires a burst of stale
  // reloads (e.g. a heavy device rescan) the moment the window returns.
  const visible = usePageVisible()
  const wasVisibleRef = useRef(visible)

  // `silent` skips the busy/error churn so a background poll refreshes values
  // in place without flashing a spinner or clearing a visible error.
  const reload = useCallback(async (silent = false): Promise<void> => {
    const fetch = fetcherRef.current
    if (!fetch) return

    // Guard against overlapping loads resolving out of order: only the latest
    // call is allowed to write state, and only while still mounted.
    const seq = ++reloadSeqRef.current
    if (!silent) {
      busySeqRef.current = seq
      setIsBusy(true)
      setError(null)
    }

    try {
      const result = await fetch()
      if (seq === reloadSeqRef.current && mountedRef.current) {
        setData(result)
        if (silent) setError(null)
      }
    } catch (cause) {
      if (seq === reloadSeqRef.current && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : errorMessage)
      }
    } finally {
      // Clear busy when the owning (non-silent) reload settles, even if a
      // silent poll superseded it for data — comparing against reloadSeqRef
      // here is what used to leave the spinner stuck after such an overlap.
      if (!silent && seq === busySeqRef.current && mountedRef.current) setIsBusy(false)
    }
  }, [errorMessage])

  useEffect(() => {
    // A changed resetKey (e.g. the network switched) invalidates the cache so
    // we never serve the previous network's data. The initial transition from
    // "no key yet" to the first real key is NOT a switch — it's the key merely
    // becoming known (network info finishing loading just after the first fetch
    // already kicked off) — so it must neither clear state nor force a redundant
    // refetch. Only a change between two known keys is a real invalidation.
    const keyChanged = resetKeyRef.current !== resetKey
    const hadPreviousKey = resetKeyRef.current != null
    if (keyChanged) {
      resetKeyRef.current = resetKey
      if (hadPreviousKey) {
        hasRunRef.current = false
        setData(null)
        setError(null)
      }
    }
    if (!enabled) return
    // Poll-only resource: its first value is seeded elsewhere, so it fetches on
    // its interval/resume only — never an on-enable probe.
    if (!fetchOnEnable) return
    // The key just settled null→real without a real switch. The on-enable fetch
    // has already run against the (only) network, so this settle must not fire a
    // second, identical probe on top of it.
    if (keyChanged && !hadPreviousKey && hasRunRef.current) return
    if (!refetchOnEnable && hasRunRef.current) return
    hasRunRef.current = true
    void reload()
  }, [enabled, refetchOnEnable, reload, resetKey, fetchOnEnable])

  useEffect(() => {
    // While the owning tab is visible, refresh in the background so values stay
    // live without the user tapping refresh. Silent so it never flashes a
    // spinner over data already on screen. Paused while hidden, with one fresh
    // read on resume so the first thing you see after a background stretch is
    // current — the enable/reset effect already covers the initial load.
    const resumed = visible && !wasVisibleRef.current
    wasVisibleRef.current = visible
    if (!enabled || !pollIntervalMs || !visible) return
    if (resumed) void reload(true)
    const intervalId = window.setInterval(() => void reload(true), pollIntervalMs)
    return () => window.clearInterval(intervalId)
  }, [enabled, pollIntervalMs, visible, reload])

  useEffect(() => {
    // Mark unmounted so a fetch that resolves afterward can't setState. Using a
    // dedicated liveness ref (not a sequence bump) is what makes this safe under
    // StrictMode's mount → unmount → remount: the cleanup flips this false, the
    // remount flips it true again before the in-flight fetch resolves, so the
    // initial load still lands instead of being orphaned. A real network switch
    // or overlapping reload is superseded separately by reload()'s sequence bump.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return { data, isBusy, error, reload }
}
