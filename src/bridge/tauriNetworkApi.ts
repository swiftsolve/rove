/**
 * Tauri implementation of the `window.networkAPI` / `window.windowControls`
 * bridge the UI was built against. Installed once at startup inside Tauri;
 * the browser dev mock covers everything else.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  DataUsageSummary,
  LanDeviceScan,
  LiveThroughput,
  NetworkAPI,
  NetworkDiagnostics,
  NetworkInfo,
  NetworkInterfaceSummary,
  SpeedTestProgress,
  SpeedTestResult,
  Unsubscribe,
  WindowControls,
} from '@/types'

function subscribeEvent<T>(event: string, callback: (payload: T) => void): Unsubscribe {
  let disposed = false
  let dispose: (() => void) | null = null

  void listen<T>(event, (e) => callback(e.payload)).then((unlisten) => {
    if (disposed) unlisten()
    else dispose = unlisten
  })

  return () => {
    disposed = true
    dispose?.()
  }
}

const tauriNetworkApi: NetworkAPI = {
  getNetworkInfo: () => invoke<NetworkInfo>('get_network_info'),
  getPublicIp: () => invoke<string | null>('get_public_ip'),
  getInterfaces: () => invoke<readonly NetworkInterfaceSummary[]>('get_interfaces'),
  getDevices: () => invoke<LanDeviceScan>('get_devices'),
  runDiagnostics: () => invoke<NetworkDiagnostics>('run_diagnostics'),
  runSpeedTest: () => invoke<SpeedTestResult>('run_speed_test'),
  cancelSpeedTest: () => invoke<void>('cancel_speed_test'),
  getDataUsage: () => invoke<DataUsageSummary>('get_data_usage'),

  onSpeedTestProgress: (callback: (progress: SpeedTestProgress) => void) =>
    subscribeEvent('speed-test-progress', callback),

  subscribeLiveThroughput: () => invoke<void>('subscribe_live_throughput'),
  unsubscribeLiveThroughput: () => invoke<void>('unsubscribe_live_throughput'),
  onLiveThroughput: (callback: (throughput: LiveThroughput) => void) =>
    subscribeEvent('live-throughput', callback),
}

const tauriWindowControls: WindowControls = {
  minimize: () => void getCurrentWindow().minimize(),
  toggleMaximize: () => void getCurrentWindow().toggleMaximize(),
  close: () => void getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  onMaximizedChange: (callback: (maximized: boolean) => void) => {
    let disposed = false
    let dispose: (() => void) | null = null
    void getCurrentWindow()
      .onResized(() => void getCurrentWindow().isMaximized().then(callback))
      .then((unlisten) => {
        if (disposed) unlisten()
        else dispose = unlisten
      })
    return () => {
      disposed = true
      dispose?.()
    }
  },
}

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export function installTauriBridge(): void {
  Object.assign(window, {
    networkAPI: tauriNetworkApi,
    windowControls: tauriWindowControls,
  })
}
