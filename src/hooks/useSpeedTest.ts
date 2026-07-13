import { useSyncExternalStore } from 'react'
import type { CapabilityRating, SpeedResult, SpeedTestProgress } from '@/types'
import { getLinkCapacityMbps, isWifiNetwork } from '@/types'
import {
  saveSpeedResult,
  type SpeedRunContext,
} from '@/components/speed-test/speed-history'
import type { SpeedTestConnection } from '@/components/speed-test/SpeedTestSection'
import { formatBand } from '@/lib/format'
import { getNetworkApi } from '@/bridge/networkApi'
import { getLiveThroughput, subscribeLiveThroughput } from '@/hooks/useLiveThroughput'

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
    return {
      connectionType: 'unknown',
      networkName: null,
      linkSpeedMbps: null,
      frequency: null,
    }
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
  /** Epoch ms the current result finished — null until a test completes. */
  readonly completedAt: number | null
  /** Link capacity captured when the last test finished. */
  readonly linkCapacityMbps: number | null
  /** Connection metadata captured when the last test finished. */
  readonly runConnection: SpeedTestConnection | null
  /**
   * Running peak of the live throughput per direction *during* the current
   * test. Lives in this module store (not component state) so it survives the
   * Speed view unmounting mid-test — otherwise switching tabs and back would
   * zero the on-screen download/upload figures.
   */
  readonly livePeakDownloadMbps: number
  readonly livePeakUploadMbps: number
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

// While a test runs, the connection is saturated by the test itself, so the
// live throughput is a real reading of the current speed. Fold each sample into
// the running peak per direction so the on-screen numbers only ever climb. This
// runs at the module level, independent of any mounted view, so the peaks keep
// accumulating even while the Speed tab isn't on screen.
subscribeLiveThroughput(() => {
  if (!state.testing) return
  const { downloadMbps, uploadMbps } = getLiveThroughput().throughput
  const down = Math.max(state.livePeakDownloadMbps, downloadMbps)
  const up = Math.max(state.livePeakUploadMbps, uploadMbps)
  if (down === state.livePeakDownloadMbps && up === state.livePeakUploadMbps) return
  setState({ ...state, livePeakDownloadMbps: down, livePeakUploadMbps: up })
})

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function isCancellation(cause: unknown): boolean {
  // The browser mock throws an Error; Tauri rejects with the backend's plain
  // error string. Handle both so a user-initiated stop never reads as a failure.
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.includes('SPEED_TEST_CANCELLED')
}

// Monotonic run id: a late progress event or a superseded run can never write
// over a newer one's state.
let runSeq = 0
// The run a stop was requested for. A stop fired during the pre-flight — while we
// await getNetworkInfo, before the backend test is even running — would otherwise
// be lost: `cancelSpeedTest` has nothing to cancel yet, and the backend clears its
// own cancel flag when the test starts. Recording the run here lets us abort before
// ever kicking it off.
let cancelledRun = 0

async function runTest(): Promise<void> {
  if (state.testing) return

  const api = window.networkAPI
  if (!api) {
    setState({ ...state, error: 'Unable to connect to the app backend.' })
    return
  }

  const myRun = ++runSeq
  const isCurrent = (): boolean => myRun === runSeq
  const isCancelled = (): boolean => cancelledRun === myRun

  setState({
    ...state,
    testing: true,
    error: null,
    progress: { phase: 'internet', message: 'Starting speed test…', progress: 0 },
    livePeakDownloadMbps: 0,
    livePeakUploadMbps: 0,
  })

  // `settled` stops trailing progress events (e.g. the backend's final
  // "complete" tick) from racing the terminal state write below.
  let settled = false
  const unsubscribe = api.onSpeedTestProgress((progress) => {
    if (settled || !isCurrent() || isCancelled()) return
    setState({ ...state, progress })
  })

  try {
    const context = await currentRunContext()
    // A stop during the pre-flight aborts here, before the backend test starts —
    // otherwise runSpeedTest would kick off (and reset the cancel) and run to the end.
    if (isCancelled()) {
      settled = true
      unsubscribe()
      if (isCurrent()) setState({ ...state, testing: false, progress: INITIAL_PROGRESS, error: null })
      return
    }
    const result = await api.runSpeedTest()
    settled = true
    unsubscribe()
    await saveSpeedResult(result.internet, context)
    if (!isCurrent()) return
    setState({
      ...state,
      internetSpeed: result.internet,
      capabilities: result.capabilities,
      testing: false,
      progress: { phase: 'complete', message: 'Done', progress: 100 },
      error: null,
      completedAt: Date.now(),
      linkCapacityMbps: result.linkCapacityMbps ?? context.linkSpeedMbps,
      runConnection: connectionFromContext(context),
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
  if (!state.testing) return
  // Mark the in-flight run cancelled so a stop during the pre-flight still aborts
  // it before kicking off the backend test.
  cancelledRun = runSeq
  // Settle the UI immediately rather than waiting for the backend's test promise
  // to reject — that lag is what made Stop feel unresponsive. Bumping runSeq makes
  // the in-flight run non-current, so its trailing progress and terminal writes are
  // ignored and can't clobber the idle state we set here.
  runSeq++
  setState({ ...state, testing: false, progress: INITIAL_PROGRESS, error: null })
  // Still ask the backend to actually stop its work (a no-op if it hasn't started —
  // which is exactly the case the run flag covers).
  void window.networkAPI?.cancelSpeedTest()
}

export function useSpeedTest(): UseSpeedTestResult {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  return { ...snapshot, runTest, cancelTest }
}
