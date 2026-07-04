import type { Unsubscribe } from './common'
import type { DataUsageSummary } from './data-usage'
import type { LanDeviceScan } from './devices'
import type { NetworkDiagnostics } from './diagnostics'
import type { NetworkInterfaceSummary } from './interfaces'
import type { LiveThroughput } from './live-throughput'
import type { SpeedTestResult } from './capabilities'
import type { SpeedTestProgress } from './speed'
import type { NetworkInfo } from './network'

export interface NetworkAPI {
  getNetworkInfo(): Promise<NetworkInfo>
  getPublicIp(): Promise<string | null>
  getInterfaces(): Promise<readonly NetworkInterfaceSummary[]>
  getDevices(): Promise<LanDeviceScan>
  getDataUsage(): Promise<DataUsageSummary>
  runDiagnostics(): Promise<NetworkDiagnostics>
  runSpeedTest(): Promise<SpeedTestResult>
  cancelSpeedTest(): Promise<void>
  onSpeedTestProgress(callback: (progress: SpeedTestProgress) => void): Unsubscribe
  subscribeLiveThroughput(): Promise<void>
  unsubscribeLiveThroughput(): Promise<void>
  onLiveThroughput(callback: (throughput: LiveThroughput) => void): Unsubscribe
}

export interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  onMaximizedChange(callback: (maximized: boolean) => void): Unsubscribe
}

declare global {
  interface Window {
    readonly networkAPI: NetworkAPI
    readonly windowControls: WindowControls
  }
}

export {}
