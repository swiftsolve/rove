import { useSyncExternalStore } from 'react'
import type { CapabilityRating, SpeedResult, SpeedTestProgress } from '@/types'
import { appendSpeedHistory } from '@/components/speed-test/speed-history'

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

interface UseSpeedTestResult extends SpeedTestState {
  readonly runTest: () => Promise<void>
  readonly cancelTest: () => void
}

// A module-level store, not component state: the last result and an in-flight
// test must survive the Home view unmounting when you switch tabs, so they're
// still there when you switch back.
let state: SpeedTestState = {
  internetSpeed: null,
  capabilities: [],
  testing: false,
  progress: INITIAL_PROGRESS,
  error: null,
}

const listeners = new Set<() => void>()

function setState(next: SpeedTestState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function isCancellation(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('SPEED_TEST_CANCELLED')
}

async function runTest(): Promise<void> {
  if (state.testing) return

  setState({
    ...state,
    testing: true,
    error: null,
    progress: { phase: 'internet', message: 'Starting speed test…', progress: 0 },
  })

  const unsubscribe = window.networkAPI.onSpeedTestProgress((progress) => {
    setState({ ...state, progress })
  })

  try {
    const result = await window.networkAPI.runSpeedTest()
    appendSpeedHistory(result.internet)
    setState({
      ...state,
      internetSpeed: result.internet,
      capabilities: result.capabilities,
      progress: { phase: 'complete', message: 'Done', progress: 100 },
      error: null,
    })
  } catch (cause) {
    setState({
      ...state,
      // A user-initiated stop is not an error — just return to the previous state.
      error: isCancellation(cause)
        ? null
        : 'Speed test failed. Check your connection and try again.',
      progress: INITIAL_PROGRESS,
    })
  } finally {
    unsubscribe()
    setState({ ...state, testing: false })
  }
}

function cancelTest(): void {
  void window.networkAPI.cancelSpeedTest()
}

export function useSpeedTest(): UseSpeedTestResult {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  return { ...snapshot, runTest, cancelTest }
}
