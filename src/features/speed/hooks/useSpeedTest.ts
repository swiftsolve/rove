import { useSyncExternalStore } from 'react'
import type { CapabilityRating, SpeedResult, SpeedTestProgress } from '@/types'
import { getLinkCapacityMbps, isWifiNetwork } from '@/types'
import {
  saveSpeedResult,
  type SpeedRunContext,
} from '@/features/speed/utils/speed-history'
import { formatBand } from '@/lib/format'
import { getNetworkApi } from '@/bridge/network-api'
import { getLiveThroughput, subscribeLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import type { SpeedTestConnection } from '@/features/speed/types'

interface SpeedTestState {
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
   * Running peak of the live throughput per direction *during* the current
   * test. Lives in this module store (not component state) so it survives the
   * Speed view unmounting mid-test — otherwise switching tabs and back would
   * zero the on-screen download/upload figures.
   */
  livePeakDownloadMbps: number
  livePeakUploadMbps: number
}

interface UseSpeedTestResult extends SpeedTestState {
  runTest: () => Promise<void>
  cancelTest: () => void
}

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
  // The browser mock throws an Error; Tauri rejects with the backend's plain
  // error string. Handle both so a user-initiated stop never reads as a failure.
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.includes('SPEED_TEST_CANCELLED')
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

// While a test runs, the connection is saturated by the test itself, so the
// live throughput is a real reading of the current speed. Fold each sample into
// the running peak per direction so the on-screen numbers only ever climb. This
// runs at the module level, independent of any mounted view, so the peaks keep
// accumulating even while the Speed tab isn't on screen.
subscribeLiveThroughput(() => {
  if (!state.isTesting) return
  const { downloadMbps, uploadMbps } = getLiveThroughput().throughput
  const peakDownloadMbps = Math.max(state.livePeakDownloadMbps, downloadMbps)
  const peakUploadMbps = Math.max(state.livePeakUploadMbps, uploadMbps)
  const hasNewPeak =
    peakDownloadMbps !== state.livePeakDownloadMbps || peakUploadMbps !== state.livePeakUploadMbps
  if (!hasNewPeak) return
  setState({ ...state, livePeakDownloadMbps: peakDownloadMbps, livePeakUploadMbps: peakUploadMbps })
})

// Monotonic run id: a late progress event or a superseded run can never write
// over a newer one's state.
let latestRunId = 0
// The run a stop was requested for. cancelTest() also bumps latestRunId (making
// a stopped run non-current), so this is the belt-and-suspenders signal the
// progress listener checks to keep a late tick from a just-cancelled run from
// slipping through.
let cancelledRunId = 0

async function runTest(): Promise<void> {
  if (state.isTesting) return

  const api = window.networkAPI
  if (!api) {
    setState({ ...state, error: 'Unable to connect to the app backend.' })
    return
  }

  const runId = ++latestRunId
  const isCurrentRun = (): boolean => runId === latestRunId
  const isCancelledRun = (): boolean => cancelledRunId === runId

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
    if (isSettled || !isCurrentRun() || isCancelledRun()) return
    setState({ ...state, progress })
  })

  try {
    // Fetch the run context concurrently with the test instead of awaiting it
    // first. getNetworkInfo() takes 10s+ on Windows when a VPN and other virtual
    // adapters are present (each PowerShell probe enumerates them all), and
    // blocking on it here froze the UI at "Starting speed test…" for that whole
    // time before the backend test even began. The context is only needed once
    // the result is in, so overlap it with the test.
    const contextPromise = currentRunContext()
    const result = await api.runSpeedTest()
    const context = await contextPromise
    isSettled = true
    unsubscribe()
    await saveSpeedResult(result.internet, context)
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
      // A user-initiated stop is not an error — just return to the previous state.
      error: isCancellation(cause)
        ? null
        : 'Speed test failed. Check your connection and try again.',
      progress: INITIAL_PROGRESS,
    })
  }
}

function cancelTest(): void {
  if (!state.isTesting) return
  // Mark the in-flight run cancelled so a stop during the pre-flight still aborts
  // it before kicking off the backend test.
  cancelledRunId = latestRunId
  // Settle the UI immediately rather than waiting for the backend's test promise
  // to reject — that lag is what made Stop feel unresponsive. Bumping the run id
  // makes the in-flight run non-current, so its trailing progress and terminal
  // writes are ignored and can't clobber the idle state we set here.
  latestRunId++
  setState({ ...state, isTesting: false, progress: INITIAL_PROGRESS, error: null })
  // Still ask the backend to actually stop its work (a no-op if it hasn't started —
  // which is exactly the case the cancelled run id covers).
  void window.networkAPI?.cancelSpeedTest()
}

export function useSpeedTest(): UseSpeedTestResult {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  return { ...snapshot, runTest, cancelTest }
}
