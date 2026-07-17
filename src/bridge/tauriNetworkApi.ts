/**
 * Tauri implementation of the `window.networkAPI` / `window.windowControls`
 * bridge the UI was built against. Installed once at startup inside Tauri;
 * the browser dev mock covers everything else.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  AppUsageSummary,
  HostUsageSummary,
  TrafficUsageSummary,
  DataUsageSummary,
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
  Unsubscribe,
  WifiShare,
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
  getWifiShare: () => invoke<WifiShare>('get_wifi_share'),
  getPublicIp: () => invoke<string | null>('get_public_ip'),
  getInterfaces: () => invoke<readonly NetworkInterfaceSummary[]>('get_interfaces'),
  getDevices: () => invoke<LanDeviceScan>('get_devices'),
  getNetworkEvents: () => invoke<readonly NetworkEvent[]>('get_network_events'),
  runDiagnostics: () => invoke<NetworkDiagnostics>('run_diagnostics'),
  runDiagnosticsLive: () => invoke<LiveDiagnostics>('run_diagnostics_live'),
  runServices: () => invoke<ServicesReport>('run_services'),
  getInternetStatus: () => invoke<InternetStatus | null>('get_internet_status'),
  testService: (host: string) => invoke<number | null>('test_service', { host }),
  listServices: () => invoke<readonly ServiceDefinition[]>('list_services'),
  addService: (name: string, host: string) =>
    invoke<readonly ServiceDefinition[]>('add_service', { name, host }),
  deleteService: (host: string) =>
    invoke<readonly ServiceDefinition[]>('delete_service', { host }),
  getServiceHistory: () => invoke<readonly ServiceEvent[]>('get_service_history'),
  clearServiceHistory: () => invoke<void>('clear_service_history'),
  onServicesTimeline: (callback: () => void) => subscribeEvent('services-timeline', callback),
  runSpeedTest: () => invoke<SpeedTestResult>('run_speed_test'),
  cancelSpeedTest: () => invoke<void>('cancel_speed_test'),
  getDataUsage: () => invoke<DataUsageSummary>('get_data_usage'),
  getAppUsage: () => invoke<AppUsageSummary>('get_app_usage'),
  getHostUsage: () => invoke<HostUsageSummary>('get_host_usage'),
  getTrafficUsage: () => invoke<TrafficUsageSummary>('get_traffic_usage'),
  getSpeedHistory: () => invoke<readonly SpeedHistoryEntry[]>('get_speed_history'),
  saveSpeedResult: (entry: SpeedHistoryEntry) => invoke<void>('save_speed_result', { entry }),
  importSpeedHistory: (entries: readonly SpeedHistoryEntry[]) =>
    invoke<void>('import_speed_history', { entries }),
  clearSpeedHistory: () => invoke<void>('clear_speed_history'),

  onSpeedTestProgress: (callback: (progress: SpeedTestProgress) => void) =>
    subscribeEvent('speed-test-progress', callback),

  onNetworkChanged: (callback: () => void) => subscribeEvent('network-changed', callback),

  onInternetStatus: (callback: (status: InternetStatus) => void) =>
    subscribeEvent('internet-status', callback),

  subscribeLiveThroughput: () => invoke<void>('subscribe_live_throughput'),
  unsubscribeLiveThroughput: () => invoke<void>('unsubscribe_live_throughput'),
  onLiveThroughput: (callback: (throughput: LiveThroughput) => void) =>
    subscribeEvent('live-throughput', callback),
}

const tauriWindowControls: WindowControls = {
  minimize: () => void getCurrentWindow().minimize(),
  close: () => void getCurrentWindow().close(),
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
