import type { NetworkDiagnostics } from '@/types'
import { useBackendResource } from '@/hooks/useBackendResource'

interface UseDiagnosticsResult {
  readonly diagnostics: NetworkDiagnostics | null
  readonly isRunning: boolean
  readonly error: string | null
  readonly run: () => Promise<void>
}

export function useDiagnostics(enabled: boolean, networkKey?: string | null): UseDiagnosticsResult {
  const { data, isBusy, error, reload } = useBackendResource(
    window.networkAPI?.runDiagnostics,
    enabled,
    'Diagnostics failed',
    { resetKey: networkKey },
  )
  return { diagnostics: data, isRunning: isBusy, error, run: reload }
}
