import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NetworkInfo } from '@/types'
import { isNetworkInfoEqual } from '@/features/connection/utils/network-info-equal'
import { getNetworkApi } from '@/bridge/networkApi'
import { useLatestRef } from '@/hooks/useLatestRef'
import { useOnNetworkChanged } from '@/hooks/useOnNetworkChanged'
import { usePageVisible } from '@/hooks/usePageVisible'

const REFRESH_INTERVAL_MS = 15_000
// Sit above the backend's own per-command budget (15s, see
// crates/rove-core/src/shell.rs). A 10s frontend timeout could fire while a
// slow-but-healthy probe was still legitimately working, turning a momentary
// stall into a scary error banner.
const NETWORK_INFO_TIMEOUT_MS = 20_000
// A single slow or failed poll shouldn't wipe a good reading off the screen.
// Keep showing the last good value and only surface an error once this many
// polls fail back-to-back (~a sustained outage, not one unlucky poll).
const FAILURES_BEFORE_ERROR = 3

/** The local link (Wi-Fi / Ethernet): `info` is null until the first read lands. */
export interface NetworkState {
  info: NetworkInfo | null
  error: string | null
  isLoading: boolean
  refresh: () => Promise<void>
  setError: (message: string | null) => void
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
  const [isLoading, setIsLoading] = useState(true)
  const infoRef = useLatestRef(info)
  // Count consecutive failures so a lone slow poll stays invisible but a real
  // sustained outage still surfaces.
  const failuresRef = useRef(0)
  // True while a refresh is awaiting the backend. Prevents an onNetworkChanged
  // nudge (fired repeatedly during Wi-Fi roaming) from stacking a second poll
  // on top of the interval poll — they'd only multiply backend load for the
  // same answer.
  const isInFlightRef = useRef(false)
  // Generation counter, bumped whenever the app resumes from the background.
  // A poll captures the current generation when it starts; if the app is
  // backgrounded and resumed while that poll is in flight, its result — and,
  // crucially, its `setTimeout`-based timeout that a suspended webview fires
  // the instant we return — belongs to a stale generation and is ignored.
  const generationRef = useRef(0)
  const isVisible = usePageVisible()

  const refresh = useCallback(async (isSilent = false): Promise<void> => {
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
      setInfo((previous) => (isNetworkInfoEqual(previous, nextInfo) ? previous : nextInfo))
      setError(null)
    } catch (unknownError) {
      // A poll that spanned a background stretch is stale — its failure (often a
      // spurious timeout the frozen timer fired on resume) must not count.
      if (generation !== generationRef.current) return
      failuresRef.current += 1
      const message =
        unknownError instanceof Error
          ? unknownError.message
          : 'Failed to read network information'
      // Keep the last good reading on screen through a transient blip. Only
      // raise the banner on the very first load (nothing to fall back to) or
      // once enough polls have failed in a row to mean a real outage.
      if (infoRef.current === null || failuresRef.current >= FAILURES_BEFORE_ERROR) {
        setError(message)
      }
    } finally {
      // Only the current generation owns the in-flight slot; a superseded poll
      // must not clear a flag a fresh post-resume poll may already hold.
      if (generation === generationRef.current) isInFlightRef.current = false
      if (!isSilent || isInitial) setIsLoading(false)
    }
  }, [infoRef])

  useEffect(() => {
    // Poll only while the window is visible. On becoming visible again after a
    // background stretch, invalidate any frozen in-flight poll (new generation),
    // drop the failure streak so a stale timeout can't tip the banner, and read
    // once immediately before resuming the interval.
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

  // Network changed — refresh at once instead of waiting out the poll interval.
  useOnNetworkChanged(() => void refresh(true))

  // Stable identities, so `useNetwork()` readers re-render only when a value changes.
  const refreshNow = useCallback((): Promise<void> => refresh(false), [refresh])
  return useMemo(
    () => ({ info, error, isLoading, refresh: refreshNow, setError }),
    [info, error, isLoading, refreshNow],
  )
}
