/**
 * Tauri implementation of the `window.networkAPI` / `window.windowControls`
 * bridge, installed once at startup.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

import type {
  AppUsageSummary,
  DataUsageSummary,
  HostUsageSummary,
  InternetStatus,
  LanDeviceScan,
  LiveDiagnostics,
  LiveThroughput,
  NetworkAPI,
  NetworkDiagnostics,
  NetworkEvent,
  NetworkInfo,
  NetworkInterfaceSummary,
  ServiceDefinition,
  ServiceEvent,
  ServicesReport,
  SpeedHistoryEntry,
  SpeedTestProgress,
  SpeedTestResult,
  TrafficUsageSummary,
  Unsubscribe,
  WifiShare,
  WindowControls,
} from '@/types'

import { knownEvents, narrowDeviceScan } from './narrow'

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T types the event's payload for listen().
function subscribeEvent<T>(event: string, callback: (payload: T) => void): Unsubscribe {
  let isDisposed = false
  let dispose: (() => void) | null = null

  // An event already queued when the subscriber leaves is dropped here, so no
  // caller needs its own "still mounted" flag.
  listen<T>(event, (e) => {
    if (!isDisposed) callback(e.payload)
  }).then(
    (unlisten) => {
      if (isDisposed) unlisten()
      else dispose = unlisten
    },
    (err: unknown) => console.warn(`Couldn't listen for ${event}:`, err),
  )

  return () => {
    isDisposed = true
    dispose?.()
  }
}

// A Rust command's `Err(String)` rejects as a bare string. Wrap it once here, so
// every caller gets an Error whose message is the backend's reason.
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error(String(cause))
  }
}

const tauriNetworkApi: NetworkAPI = {
  getNetworkInfo: () => call<NetworkInfo>('get_network_info'),
  getWifiShare: () => call<WifiShare>('get_wifi_share'),
  getPublicIp: () => call<string | null>('get_public_ip'),
  getInterfaces: () => call<NetworkInterfaceSummary[]>('get_interfaces'),
  getDevices: () => call<LanDeviceScan>('get_devices').then(narrowDeviceScan),
  getNetworkEvents: () => call<NetworkEvent[]>('get_network_events').then(knownEvents),
  runDiagnostics: () => call<NetworkDiagnostics>('run_diagnostics'),
  runDiagnosticsLive: () => call<LiveDiagnostics>('run_diagnostics_live'),
  runServices: () => call<ServicesReport>('run_services'),
  getInternetStatus: () => call<InternetStatus | null>('get_internet_status'),
  testService: (host: string) => call<number | null>('test_service', { host }),
  listServices: () => call<ServiceDefinition[]>('list_services'),
  addService: (name: string, host: string) => call<ServiceDefinition[]>('add_service', { name, host }),
  updateService: (oldHost: string, name: string, host: string) =>
    call<ServiceDefinition[]>('update_service', { oldHost, name, host }),
  deleteService: (host: string) => call<ServiceDefinition[]>('delete_service', { host }),
  getServiceHistory: () => call<ServiceEvent[]>('get_service_history'),
  clearServiceHistory: () => call<void>('clear_service_history'),
  onServicesTimeline: (callback: () => void) => subscribeEvent('services-timeline', callback),
  runSpeedTest: () => call<SpeedTestResult>('run_speed_test'),
  cancelSpeedTest: () => call<void>('cancel_speed_test'),
  getDataUsage: () => call<DataUsageSummary>('get_data_usage'),
  getAppUsage: () => call<AppUsageSummary>('get_app_usage'),
  getHostUsage: () => call<HostUsageSummary>('get_host_usage'),
  getTrafficUsage: () => call<TrafficUsageSummary>('get_traffic_usage'),
  getUsageSupportDetail: () => call<string | null>('usage_support_detail'),
  relaunchAsAdmin: () => call<void>('relaunch_as_admin'),
  getSpeedHistory: () => call<SpeedHistoryEntry[]>('get_speed_history'),
  saveSpeedResult: (entry: SpeedHistoryEntry) => call<void>('save_speed_result', { entry }),
  importSpeedHistory: (entries: SpeedHistoryEntry[]) => call<void>('import_speed_history', { entries }),
  clearSpeedHistory: () => call<void>('clear_speed_history'),

  onSpeedTestProgress: (callback: (progress: SpeedTestProgress) => void) =>
    subscribeEvent('speed-test-progress', callback),

  onNetworkChanged: (callback: () => void) => subscribeEvent('network-changed', callback),

  onInternetStatus: (callback: (status: InternetStatus) => void) => subscribeEvent('internet-status', callback),

  subscribeLiveThroughput: () => call<void>('subscribe_live_throughput'),
  unsubscribeLiveThroughput: () => call<void>('unsubscribe_live_throughput'),
  onLiveThroughput: (callback: (throughput: LiveThroughput) => void) => subscribeEvent('live-throughput', callback),
}

const tauriWindowControls: WindowControls = {
  minimize: () =>
    void getCurrentWindow()
      .minimize()
      .catch((err: unknown) => console.warn('Minimize failed:', err)),
  close: () =>
    void getCurrentWindow()
      .close()
      .catch((err: unknown) => console.warn('Close failed:', err)),
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
