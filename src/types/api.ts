import type { Unsubscribe } from './common'
import type { DataUsageSummary } from './data-usage'
import type { LanDeviceScan } from './devices'
import type { NetworkDiagnostics } from './diagnostics'
import type { NetworkInterfaceSummary } from './interfaces'
import type { LiveThroughput } from './live-throughput'
import type { SpeedTestResult } from './capabilities'
import type { SpeedTestProgress } from './speed'
import type { NetworkInfo } from './network'
import type { SpeedHistoryEntry } from './history'

export interface NetworkAPI {
  getNetworkInfo(): Promise<NetworkInfo>
  getPublicIp(): Promise<string | null>
  getInterfaces(): Promise<readonly NetworkInterfaceSummary[]>
  /** Scan the LAN for connected devices. */
  getDevices(): Promise<LanDeviceScan>
  getDataUsage(): Promise<DataUsageSummary>
  runDiagnostics(): Promise<NetworkDiagnostics>
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
