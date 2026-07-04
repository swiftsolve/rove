import { useCallback, useEffect, useState } from 'react'
import type { NetworkInterfaceSummary } from '@shared/types'

interface UseNetworkInterfacesResult {
  readonly interfaces: readonly NetworkInterfaceSummary[]
  readonly isLoading: boolean
  readonly error: string | null
  readonly refresh: () => Promise<void>
}

export function useNetworkInterfaces(enabled: boolean): UseNetworkInterfacesResult {
  const [interfaces, setInterfaces] = useState<readonly NetworkInterfaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.networkAPI?.getInterfaces) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await window.networkAPI.getInterfaces()
      setInterfaces(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load interfaces')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, refresh])

  return { interfaces, isLoading, error, refresh }
}
