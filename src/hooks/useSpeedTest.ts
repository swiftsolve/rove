import { useSyncExternalStore } from 'react'
import type { CapabilityRating, SpeedResult, SpeedTestProgress } from '@/types'
import { saveSpeedResult, type SpeedRunContext } from '@/components/speed-test/speed-history'
import { getNetworkApi } from '@/bridge/networkApi'

/** The connection in use right now, to stamp onto the recorded result. */
async function currentRunContext(): Promise<SpeedRunContext> {
  try {
    const info = await getNetworkApi().getNetworkInfo()
    return {
      connectionType: info.connectionType,
      networkName: info.connectionType === 'wifi' ? (info.ssid ?? null) : null,
    }
  } catch {
    return { connectionType: 'unknown', networkName: null }
  }
}

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

// Monotonic run id: a late progress event or a superseded run can never write
// over a newer one's state.
let runSeq = 0

async function runTest(): Promise<void> {
  if (state.testing) return

  const api = window.networkAPI
  if (!api) {
    setState({ ...state, error: 'Unable to connect to the app backend.' })
    return
  }

  const myRun = ++runSeq
  const isCurrent = (): boolean => myRun === runSeq

  setState({
    ...state,
    testing: true,
    error: null,
    progress: { phase: 'internet', message: 'Starting speed test…', progress: 0 },
  })

  // `settled` stops trailing progress events (e.g. the backend's final
  // "complete" tick) from racing the terminal state write below.
  let settled = false
  const unsubscribe = api.onSpeedTestProgress((progress) => {
    if (settled || !isCurrent()) return
    setState({ ...state, progress })
  })

  try {
    const result = await api.runSpeedTest()
    settled = true
    unsubscribe()
    await saveSpeedResult(result.internet, await currentRunContext())
    if (!isCurrent()) return
    setState({
      ...state,
      internetSpeed: result.internet,
      capabilities: result.capabilities,
      testing: false,
      progress: { phase: 'complete', message: 'Done', progress: 100 },
      error: null,
    })
  } catch (cause) {
    settled = true
    unsubscribe()
    if (!isCurrent()) return
    setState({
      ...state,
      testing: false,
      // A user-initiated stop is not an error — just return to the previous state.
      error: isCancellation(cause)
        ? null
        : 'Speed test failed. Check your connection and try again.',
      progress: INITIAL_PROGRESS,
    })
  }
}

function cancelTest(): void {
  void window.networkAPI?.cancelSpeedTest()
}

export function useSpeedTest(): UseSpeedTestResult {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  return { ...snapshot, runTest, cancelTest }
}
