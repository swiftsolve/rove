import { useCallback, useEffect, useRef, useState } from 'react'
import type { NetworkInfo } from '@/types'
import { networkInfoEqual } from '@/components/connection/network-info-equal'
import { getNetworkApi } from '@/bridge/networkApi'
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
const FAILURE_GRACE = 3

interface UseNetworkInfoResult {
  readonly info: NetworkInfo | null
  readonly error: string | null
  readonly isLoading: boolean
  readonly refresh: () => Promise<void>
  readonly setError: (message: string | null) => void
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

export function useNetworkInfo(): UseNetworkInfoResult {
  const [info, setInfo] = useState<NetworkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const infoRef = useRef<NetworkInfo | null>(null)
  infoRef.current = info
  // Count consecutive failures so a lone slow poll stays invisible but a real
  // sustained outage still surfaces.
  const failuresRef = useRef(0)
  // True while a refresh is awaiting the backend. Prevents an onNetworkChanged
  // nudge (fired repeatedly during Wi-Fi roaming) from stacking a second poll
  // on top of the interval poll — they'd only multiply backend load for the
  // same answer.
  const inFlightRef = useRef(false)
  // Generation counter, bumped whenever the app resumes from the background.
  // A poll captures the current generation when it starts; if the app is
  // backgrounded and resumed while that poll is in flight, its result — and,
  // crucially, its `setTimeout`-based timeout that a suspended webview fires
  // the instant we return — belongs to a stale generation and is ignored.
  const genRef = useRef(0)
  const visible = usePageVisible()

  const refresh = useCallback(async (silent = false): Promise<void> => {
    const bridgeError = getNetworkApiError()
    if (bridgeError) {
      setError(bridgeError)
      setIsLoading(false)
      return
    }

    if (inFlightRef.current) return
    inFlightRef.current = true
    const gen = genRef.current

    const isInitial = infoRef.current === null
    if (!silent && isInitial) setIsLoading(true)

    try {
      const data = await withTimeout(
        getNetworkApi().getNetworkInfo(),
        NETWORK_INFO_TIMEOUT_MS,
        'Network detection timed out.',
      )

      if (gen !== genRef.current) return
      failuresRef.current = 0
      setInfo((previous) => (networkInfoEqual(previous, data) ? previous : data))
      setError(null)
    } catch (unknownError) {
      // A poll that spanned a background stretch is stale — its failure (often a
      // spurious timeout the frozen timer fired on resume) must not count.
      if (gen !== genRef.current) return
      failuresRef.current += 1
      const message =
        unknownError instanceof Error
          ? unknownError.message
          : 'Failed to read network information'
      // Keep the last good reading on screen through a transient blip. Only
      // raise the banner on the very first load (nothing to fall back to) or
      // once enough polls have failed in a row to mean a real outage.
      if (infoRef.current === null || failuresRef.current >= FAILURE_GRACE) {
        setError(message)
      }
    } finally {
      // Only the current generation owns the in-flight slot; a superseded poll
      // must not clear a flag a fresh post-resume poll may already hold.
      if (gen === genRef.current) inFlightRef.current = false
      if (!silent || isInitial) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Poll only while the window is visible. On becoming visible again after a
    // background stretch, invalidate any frozen in-flight poll (new generation),
    // drop the failure streak so a stale timeout can't tip the banner, and read
    // once immediately before resuming the interval.
    if (!visible) return
    genRef.current += 1
    inFlightRef.current = false
    failuresRef.current = 0
    void refresh(false)
    const intervalId = window.setInterval(() => void refresh(true), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [visible, refresh])

  // The backend watches the routing table — refresh the moment it nudges us
  // (cable pulled, Wi-Fi joined) instead of waiting out the poll interval.
  useEffect(() => {
    const api = window.networkAPI
    if (!api?.onNetworkChanged) return
    let active = true
    const detach = api.onNetworkChanged(() => {
      if (active) void refresh(true)
    })
    return () => {
      active = false
      detach()
    }
  }, [refresh])

  return { info, error, isLoading, refresh: () => refresh(false), setError }
}
