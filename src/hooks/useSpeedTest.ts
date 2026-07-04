import { useCallback, useState } from 'react'
import type { CapabilityRating, SpeedResult, SpeedTestProgress } from '@shared/types'
import { appendSpeedHistory } from '../utils/speed-history'

const INITIAL_PROGRESS = {
  phase: 'idle',
  message: '',
  progress: 0,
} as const satisfies SpeedTestProgress

interface SpeedTestState {
  readonly internetSpeed: SpeedResult | null
  readonly capabilities: readonly CapabilityRating[]
  readonly testing: boolean
  readonly progress: SpeedTestProgress
  readonly error: string | null
}

const INITIAL_STATE: SpeedTestState = {
  internetSpeed: null,
  capabilities: [],
  testing: false,
  progress: INITIAL_PROGRESS,
  error: null,
}

interface UseSpeedTestResult extends SpeedTestState {
  readonly runTest: () => Promise<void>
  readonly cancelTest: () => void
}

function isCancellation(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('SPEED_TEST_CANCELLED')
}

export function useSpeedTest(): UseSpeedTestResult {
  const [state, setState] = useState<SpeedTestState>(INITIAL_STATE)

  const runTest = useCallback(async (): Promise<void> => {
    setState((current) => ({
      ...current,
      testing: true,
      error: null,
      progress: { phase: 'internet', message: 'Starting speed test…', progress: 0 },
    }))

    const unsubscribe = window.networkAPI.onSpeedTestProgress((progress) => {
      setState((current) => ({ ...current, progress }))
    })

    try {
      const result = await window.networkAPI.runSpeedTest()
      appendSpeedHistory(result.internet)
      setState((current) => ({
        ...current,
        internetSpeed: result.internet,
        capabilities: result.capabilities,
        progress: { phase: 'complete', message: 'Done', progress: 100 },
        error: null,
      }))
    } catch (cause) {
      setState((current) => ({
        ...current,
        // A user-initiated stop is not an error — just return to the previous state.
        error: isCancellation(cause)
          ? null
          : 'Speed test failed. Check your connection and try again.',
        progress: INITIAL_PROGRESS,
      }))
    } finally {
      unsubscribe()
      setState((current) => ({ ...current, testing: false }))
    }
  }, [])

  const cancelTest = useCallback((): void => {
    void window.networkAPI.cancelSpeedTest()
  }, [])

  return { ...state, runTest, cancelTest }
}
