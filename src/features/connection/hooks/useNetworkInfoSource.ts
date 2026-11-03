import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getNetworkApi } from '@/bridge/network-api'
import { isNetworkInfoEqual } from '@/features/connection/utils/network-info-equal'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'
import { usePageVisible } from '@/hooks/usePageVisible'
import type { NetworkInfo } from '@/types'
import { useLatestRef } from '@/ui'

const REFRESH_INTERVAL_MS = 15_000
// Above the backend's 15s per-command budget (crates/rove-core/src/shell.rs), so a
// slow but healthy probe never trips an error here first.
const NETWORK_INFO_TIMEOUT_MS = 20_000
// Consecutive failed polls before the error shows; until then the last good
// reading stays on screen.
const FAILURES_BEFORE_ERROR = 3

/** The local link (Wi-Fi / Ethernet): `info` is null until the first read lands. */
export type NetworkState = {
  info: NetworkInfo | null
  error: string | null
  /**
   * When the last good reading landed, as of the latest error: the age of the
   * `info` an error banner sits over. Set only when an error is raised, so a
   * successful poll doesn't re-render every reader.
   */
  lastReadAt: number | null
  isLoading: boolean
  refresh: () => Promise<void>
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)

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

function getNetworkApiError(): string | null {
  if (typeof window === 'undefined') return 'Window is not available.'
  if (!window.networkAPI) {
    return 'Unable to connect to the app backend. Try restarting the application.'
  }
  return null
}

/**
 * Creates the app's network state: reads network info on mount, polls it while
 * the window is visible and refreshes on the backend's network-changed nudge.
 * Called once, by `NetworkProvider`; components read it with `useNetwork()`.
 */
export function useNetworkInfoSource(): NetworkState {
  const [info, setInfo] = useState<NetworkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastReadAt, setLastReadAt] = useState<number | null>(null)
  const lastReadAtRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const infoRef = useLatestRef(info)
  const failuresRef = useRef(0)
  // Stops network-changed nudges (fired repeatedly while Wi-Fi roams) from
  // stacking polls on one already in flight.
  const isInFlightRef = useRef(false)
  // Bumped on each resume from the background. A suspended webview fires a frozen
  // poll's timeout the instant it resumes; the generation check ignores it.
  const generationRef = useRef(0)
  const isVisible = usePageVisible()

  const refresh = useCallback(
    async (isSilent = false): Promise<void> => {
      const bridgeError = getNetworkApiError()
      if (bridgeError) {
        setError(bridgeError)
        setIsLoading(false)
        return
      }

      if (isInFlightRef.current) return
      isInFlightRef.current = true
      const generation = generationRef.current

      const isInitial = infoRef.current === null
      if (!isSilent && isInitial) setIsLoading(true)

      try {
        const nextInfo = await withTimeout(
          getNetworkApi().getNetworkInfo(),
          NETWORK_INFO_TIMEOUT_MS,
          'Network detection timed out.',
        )

        if (generation !== generationRef.current) return
        failuresRef.current = 0
        lastReadAtRef.current = Date.now()
        setInfo((previous) => (isNetworkInfoEqual(previous, nextInfo) ? previous : nextInfo))
        setError(null)
      } catch (unknownError) {
        if (generation !== generationRef.current) return
        failuresRef.current += 1
        const message = unknownError instanceof Error ? unknownError.message : 'Failed to read network information'
        if (infoRef.current === null || failuresRef.current >= FAILURES_BEFORE_ERROR) {
          setError(message)
          setLastReadAt(lastReadAtRef.current)
        }
      } finally {
        // Only the current generation owns the in-flight slot; a superseded poll
        // must not clear a flag a fresh post-resume poll may already hold.
        if (generation === generationRef.current) isInFlightRef.current = false
        if (!isSilent || isInitial) setIsLoading(false)
      }
    },
    [infoRef],
  )

  useEffect(() => {
    // On resume, drop any frozen poll and the failure streak before reading again.
    if (!isVisible) return
    generationRef.current += 1
    isInFlightRef.current = false
    failuresRef.current = 0
    // Deliberate: a non-silent read raises the loading flag before it awaits, so
    // a resume after a failed first load shows the spinner instead of the error.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(false)
    const intervalId = window.setInterval(() => void refresh(true), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [isVisible, refresh])

  useOnNetworkChanged(() => void refresh(true))

  // Stable identities, so `useNetwork()` readers re-render only when a value changes.
  const refreshNow = useCallback((): Promise<void> => refresh(false), [refresh])
  return useMemo(
    () => ({ info, error, lastReadAt, isLoading, refresh: refreshNow }),
    [info, error, lastReadAt, isLoading, refreshNow],
  )
}
