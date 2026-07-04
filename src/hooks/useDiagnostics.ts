import { useCallback, useEffect, useRef, useState } from 'react'
import type { NetworkDiagnostics } from '@/types'

interface UseDiagnosticsResult {
  readonly diagnostics: NetworkDiagnostics | null
  readonly isRunning: boolean
  readonly error: string | null
  readonly run: () => Promise<void>
}

export function useDiagnostics(enabled: boolean): UseDiagnosticsResult {
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnostics | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRunDoneRef = useRef(false)

  const run = useCallback(async (): Promise<void> => {
    if (!window.networkAPI?.runDiagnostics) return

    setIsRunning(true)
    setError(null)

    try {
      const result = await window.networkAPI.runDiagnostics()
      setDiagnostics(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Diagnostics failed')
    } finally {
      setIsRunning(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || autoRunDoneRef.current) return
    autoRunDoneRef.current = true
    void run()
  }, [enabled, run])

  return { diagnostics, isRunning, error, run }
}
