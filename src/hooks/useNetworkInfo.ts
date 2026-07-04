import { useCallback, useEffect, useRef, useState } from 'react'
import type { NetworkInfo } from '@shared/types'
import { networkInfoEqual } from '../utils/network-info-equal'

const REFRESH_INTERVAL_MS = 15_000
const NETWORK_INFO_TIMEOUT_MS = 10_000

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

  const refresh = useCallback(async (silent = false): Promise<void> => {
    const bridgeError = getNetworkApiError()
    if (bridgeError) {
      setError(bridgeError)
      setIsLoading(false)
      return
    }

    const isInitial = infoRef.current === null
    if (!silent && isInitial) setIsLoading(true)

    try {
      const data = await withTimeout(
        window.networkAPI.getNetworkInfo(),
        NETWORK_INFO_TIMEOUT_MS,
        'Network detection timed out. Check your connection and try again.',
      )

      setInfo((previous) => (networkInfoEqual(previous, data) ? previous : data))
      setError(null)
    } catch (unknownError) {
      const message =
        unknownError instanceof Error
          ? unknownError.message
          : 'Failed to read network information'
      setError(message)
    } finally {
      if (!silent || isInitial) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(false)
    const intervalId = window.setInterval(() => void refresh(true), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [refresh])

  return { info, error, isLoading, refresh: () => refresh(false), setError }
}
