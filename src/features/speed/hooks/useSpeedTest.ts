import { useSyncExternalStore } from 'react'

import { queryClient } from '@/app/utils/query-client'
import { getNetworkApi } from '@/bridge/network-api'
import { getLiveThroughput, subscribeLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import { SPEED_HISTORY_KEY } from '@/features/speed/hooks/useSpeedHistory'
import type { SpeedTestConnection } from '@/features/speed/types'
import { saveSpeedResult } from '@/features/speed/utils/speed-history'
import { formatBand } from '@/lib/format'
import type { CapabilityRating, SpeedResult, SpeedRunContext, SpeedTestProgress } from '@/types'
import { getLinkCapacityMbps, isWifiNetwork } from '@/types'

type SpeedTestState = {
  internetSpeed: SpeedResult | null
  capabilities: CapabilityRating[]
  isTesting: boolean
  progress: SpeedTestProgress
  /** The run in flight, or the last one; tells a new run's progress from an old one's. */
  runId: number
  error: string | null
  /** Epoch ms the current result finished — null until a test completes. */
  completedAt: number | null
  /** Link capacity captured when the last test finished. */
  linkCapacityMbps: number | null
  /** Connection metadata captured when the last test finished. */
  runConnection: SpeedTestConnection | null
  /**
   * Running peak of the live throughput per direction during the current test.
   * Kept in the module store so it survives the Speed view unmounting mid-test.
   */
  livePeakDownloadMbps: number
  livePeakUploadMbps: number
}

/** The store's state and the actions that change it, as `useSpeedTest` selects from. */
export type SpeedTest = {
  runTest: () => Promise<void>
  cancelTest: () => void
} & SpeedTestState

const INITIAL_PROGRESS = {
  phase: 'idle',
  message: '',
  progress: 0,
} as const satisfies SpeedTestProgress

const UNKNOWN_RUN_CONTEXT: SpeedRunContext = {
  connectionType: 'unknown',
  networkName: null,
  linkSpeedMbps: null,
  frequency: null,
}

function connectionFromContext(context: SpeedRunContext): SpeedTestConnection | null {
  if (context.connectionType === 'wifi') {
    return {
      type: 'wifi',
      name: context.networkName,
      band: formatBand(context.frequency),
    }
  }
  if (context.connectionType === 'ethernet') {
    return { type: 'ethernet', name: null, band: null }
  }
  return null
}

/** The connection in use right now, to stamp onto the recorded result. */
async function currentRunContext(): Promise<SpeedRunContext> {
  try {
    const info = await getNetworkApi().getNetworkInfo()
    return {
      connectionType: info.connectionType,
      networkName: isWifiNetwork(info) ? (info.ssid ?? null) : null,
      linkSpeedMbps: getLinkCapacityMbps(info),
      frequency: isWifiNetwork(info) ? info.frequency : null,
    }
  } catch {
    return { ...UNKNOWN_RUN_CONTEXT }
  }
}

function isCancellation(cause: unknown): boolean {
  // The backend marks a user's stop with this code, so it never reads as a failure.
  return cause instanceof Error && cause.message.includes('SPEED_TEST_CANCELLED')
}

// A module-level store, not component state: the last result and an in-flight
// test must survive the Speed and Home views unmounting when you switch tabs,
// so they're still there when you switch back.
let state: SpeedTestState = {
  internetSpeed: null,
  capabilities: [],
  isTesting: false,
  progress: INITIAL_PROGRESS,
  runId: 0,
  error: null,
  completedAt: null,
  linkCapacityMbps: null,
  runConnection: null,
  livePeakDownloadMbps: 0,
  livePeakUploadMbps: 0,
}

// What `useSpeedTest` selects from: rebuilt only when the state changes, so a
// selector that returns it whole (or any field of it) returns the same value
// until then. The actions are function declarations, hoisted above this.
let snapshot: SpeedTest = { ...state, runTest, cancelTest }

const listeners = new Set<() => void>()

function setState(next: SpeedTestState): void {
  state = next
  snapshot = { ...next, runTest, cancelTest }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// During a test the test itself saturates the link, so live throughput is a real
// speed reading. Subscribed at module level so the peaks keep accumulating while
// the Speed tab is off screen.
subscribeLiveThroughput(() => {
  if (!state.isTesting) return
  const { downloadMbps, uploadMbps } = getLiveThroughput().throughput
  const peakDownloadMbps = Math.max(state.livePeakDownloadMbps, downloadMbps)
  const peakUploadMbps = Math.max(state.livePeakUploadMbps, uploadMbps)
  const hasNewPeak = peakDownloadMbps !== state.livePeakDownloadMbps || peakUploadMbps !== state.livePeakUploadMbps
  if (!hasNewPeak) return
  setState({ ...state, livePeakDownloadMbps: peakDownloadMbps, livePeakUploadMbps: peakUploadMbps })
})

// Monotonic run id: a late progress event, a stopped run or a superseded one can
// never write over a newer one's state, or save its result.
let latestRunId = 0
// The backend's name for the run in flight, unique across reloads, so a Stop
// reaches the right run even before it has started there.
let runToken = ''

async function runTest(): Promise<void> {
  if (state.isTesting) return

  const api = window.networkAPI
  if (!api) {
    setState({ ...state, error: 'Unable to connect to the app backend.' })
    return
  }

  const runId = ++latestRunId
  const isCurrentRun = (): boolean => runId === latestRunId
  runToken = `${Date.now()}-${runId}`

  setState({
    ...state,
    isTesting: true,
    error: null,
    progress: { phase: 'internet', message: 'Starting speed test…', progress: 0 },
    runId,
    livePeakDownloadMbps: 0,
    livePeakUploadMbps: 0,
  })

  // `isSettled` stops trailing progress events (e.g. the backend's final
  // "complete" tick) from racing the terminal state write below.
  let isSettled = false
  const unsubscribe = api.onSpeedTestProgress((progress) => {
    if (isSettled || !isCurrentRun()) return
    setState({ ...state, progress })
  })

  try {
    // Overlap the context read with the test: getNetworkInfo() can take 10s+ on
    // Windows with a VPN and other virtual adapters, and awaiting it first froze
    // the UI at "Starting speed test…".
    const contextPromise = currentRunContext()
    const result = await api.runSpeedTest(runToken)
    const context = await contextPromise
    isSettled = true
    unsubscribe()
    // A run stopped after the backend finished it still resolves: it isn't kept.
    if (!isCurrentRun()) return
    await saveSpeedResult(result.internet, context)
    // A history page that's open re-reads now; a closed one reads when it opens.
    void queryClient.invalidateQueries({ queryKey: SPEED_HISTORY_KEY })
    if (!isCurrentRun()) return
    setState({
      ...state,
      internetSpeed: result.internet,
      capabilities: result.capabilities,
      isTesting: false,
      progress: { phase: 'complete', message: 'Done', progress: 100 },
      error: null,
      completedAt: Date.now(),
      linkCapacityMbps: result.linkCapacityMbps ?? context.linkSpeedMbps,
      runConnection: connectionFromContext(context),
    })
  } catch (cause) {
    isSettled = true
    unsubscribe()
    if (!isCurrentRun()) return
    setState({
      ...state,
      isTesting: false,
      // A user-initiated stop is not an error.
      error: isCancellation(cause) ? null : 'Speed test failed. Check your connection and try again.',
      progress: INITIAL_PROGRESS,
    })
  }
}

function cancelTest(): void {
  if (!state.isTesting) return
  // Settle the UI now rather than wait for the backend to reject, which made Stop
  // feel unresponsive. The bumped run id turns the old run's late writes into no-ops.
  latestRunId++
  setState({ ...state, isTesting: false, progress: INITIAL_PROGRESS, error: null })
  // Stops the run even if it hasn't reached the backend yet.
  window.networkAPI
    ?.cancelSpeedTest(runToken)
    .catch((err: unknown) => console.warn('Cancelling the speed test failed:', err))
}

/**
 * Reads what `select` picks from the speed test. A component re-renders only
 * when its pick changes, so one that shows the result doesn't re-render on each
 * live-peak update while a test runs. Pick a field, or the whole `SpeedTest`;
 * a new object built in `select` would never compare equal.
 */
export function useSpeedTest<T>(select: (test: SpeedTest) => T): T {
  return useSyncExternalStore(subscribe, () => select(snapshot))
}
