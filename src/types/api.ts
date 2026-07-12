import type { Unsubscribe } from './common'
import type { DataUsageSummary } from './data-usage'
import type { LanDeviceScan } from './devices'
import type { NetworkEvent } from './events'
import type { LiveDiagnostics, NetworkDiagnostics, ServiceDefinition } from './diagnostics'
import type { NetworkInterfaceSummary } from './interfaces'
import type { LiveThroughput } from './live-throughput'
import type { SpeedTestResult } from './capabilities'
import type { SpeedTestProgress } from './speed'
import type { NetworkInfo, WifiShare } from './network'
import type { SpeedHistoryEntry } from './history'

export interface NetworkAPI {
  getNetworkInfo(): Promise<NetworkInfo>
  /** Build a shareable QR + credentials for the current Wi-Fi network. Rejects
   *  when there's no Wi-Fi link to share. */
  getWifiShare(): Promise<WifiShare>
  getPublicIp(): Promise<string | null>
  getInterfaces(): Promise<readonly NetworkInterfaceSummary[]>
  /** Scan the LAN for connected devices. */
  getDevices(): Promise<LanDeviceScan>
  /** The network-change feed (new devices, departures, identity changes),
   *  newest first. Populated as a side effect of device scans. */
  getNetworkEvents(): Promise<readonly NetworkEvent[]>
  getDataUsage(): Promise<DataUsageSummary>
  runDiagnostics(): Promise<NetworkDiagnostics>
  /** The fast-changing metrics only (gateway latency + service reachability),
   *  for the Connection view's tight refresh loop. */
  runDiagnosticsLive(): Promise<LiveDiagnostics>
  /** Probe a single host's reachability without storing it — the "test before
   *  add" step. Resolves to the latency in ms, or null when unreachable. */
  testService(host: string): Promise<number | null>
  /** The user's reachability service list — the built-in defaults plus any the
   *  user added, minus any they removed. Ordered as shown. */
  listServices(): Promise<readonly ServiceDefinition[]>
  /** Add a service to the list; returns the updated list. Re-adding an existing
   *  host updates its label rather than duplicating it. */
  addService(name: string, host: string): Promise<readonly ServiceDefinition[]>
  /** Remove the service with this host (built-in or custom); returns the
   *  updated list. */
  deleteService(host: string): Promise<readonly ServiceDefinition[]>
  runSpeedTest(): Promise<SpeedTestResult>
  cancelSpeedTest(): Promise<void>
  /** Past speed-test results, newest first, from the local database. */
  getSpeedHistory(): Promise<readonly SpeedHistoryEntry[]>
  /** Persist one completed speed-test result. */
  saveSpeedResult(entry: SpeedHistoryEntry): Promise<void>
  /** Bulk-insert results (used once to migrate legacy localStorage history). */
  importSpeedHistory(entries: readonly SpeedHistoryEntry[]): Promise<void>
  clearSpeedHistory(): Promise<void>
  onSpeedTestProgress(callback: (progress: SpeedTestProgress) => void): Unsubscribe
  /** Fires when the OS routing table changes (cable pulled, Wi-Fi joined). */
  onNetworkChanged(callback: () => void): Unsubscribe
  subscribeLiveThroughput(): Promise<void>
  unsubscribeLiveThroughput(): Promise<void>
  onLiveThroughput(callback: (throughput: LiveThroughput) => void): Unsubscribe
}

export interface WindowControls {
  minimize(): void
  close(): void
}

declare global {
  interface Window {
    // Optional: the plain web build (`build:web`) ships without a bridge, so
    // every consumer must guard. Use `getNetworkApi()` where a throw is fine.
    readonly networkAPI?: NetworkAPI
    readonly windowControls?: WindowControls
  }
}

export {}
