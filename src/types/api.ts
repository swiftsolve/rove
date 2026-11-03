import type { AppUsageSummary } from './app-usage'
import type { SpeedTestResult } from './capabilities'
import type { Unsubscribe } from './common'
import type { DataUsageSummary } from './data-usage'
import type { LanDeviceScan } from './devices'
import type {
  InternetStatus,
  LiveDiagnostics,
  NetworkDiagnostics,
  ServiceDefinition,
  ServiceEvent,
  ServicesReport,
} from './diagnostics'
import type { NetworkEvent } from './events'
import type { SpeedHistoryEntry } from './history'
import type { HostUsageSummary } from './host-usage'
import type { NetworkInterfaceSummary } from './interfaces'
import type { LiveThroughput } from './live-throughput'
import type { NetworkInfo, WifiShare } from './network'
import type { SpeedTestProgress } from './speed'
import type { TrafficUsageSummary } from './traffic-usage'

export type NetworkAPI = {
  getNetworkInfo(): Promise<NetworkInfo>
  /**
   * Build a shareable QR + credentials for the current Wi-Fi network. Rejects
   * when there's no Wi-Fi link to share.
   */
  getWifiShare(): Promise<WifiShare>
  getPublicIp(): Promise<string | null>
  getInterfaces(): Promise<NetworkInterfaceSummary[]>
  getDevices(): Promise<LanDeviceScan>
  /**
   * The network-change feed, newest first. Recorded as a side effect of
   * device scans, network-info reads and internet verdicts, never on its own.
   */
  getNetworkEvents(): Promise<NetworkEvent[]>
  getDataUsage(): Promise<DataUsageSummary>
  /** Per-app network usage since Rove started watching, busiest first. */
  getAppUsage(): Promise<AppUsageSummary>
  /** Per-app remote-host breakdown (hostname + country + bytes), busiest first. */
  getHostUsage(): Promise<HostUsageSummary>
  /**
   * Session traffic by kind (protocol), busiest first: the same connections
   * as `getHostUsage`, grouped by service port instead of peer.
   */
  getTrafficUsage(): Promise<TrafficUsageSummary>
  /**
   * Why per-app usage can't be read, for the "needs administrator" state: on
   * Windows the ETW session's last start error, else (and once it's up) null.
   */
  getUsageSupportDetail(): Promise<string | null>
  /**
   * Relaunch Rove as administrator, raising the UAC prompt (Windows only).
   * Rejects when the prompt is declined; on success this instance exits.
   */
  relaunchAsAdmin(): Promise<void>
  runDiagnostics(): Promise<NetworkDiagnostics>
  /**
   * The fast-changing gateway metrics only, for the Connection view's tight
   * refresh loop.
   */
  runDiagnosticsLive(): Promise<LiveDiagnostics>
  /**
   * Probe the user's service list, with the internet verdict from the same
   * batch so a mass "all down" reads as this machine being offline.
   */
  runServices(): Promise<ServicesReport>
  /**
   * The background heartbeat's last internet verdict, or null before its first
   * probe. A cached read that never probes.
   */
  getInternetStatus(): Promise<InternetStatus | null>
  /**
   * Probe one host without storing it, for the "test before add" step.
   * Resolves to the latency in ms, or null when unreachable.
   */
  testService(host: string): Promise<number | null>
  /**
   * The user's service list: the built-in defaults plus any they added, minus
   * any they removed. Ordered as shown.
   */
  listServices(): Promise<ServiceDefinition[]>
  /**
   * Add a service to the list; returns the updated list. Re-adding an existing
   * host updates its label rather than duplicating it.
   */
  addService(name: string, host: string): Promise<ServiceDefinition[]>
  /**
   * Edit the service listed under `oldHost`, keeping its place in the list;
   * returns the updated list. A new host that's already listed merges into
   * that row, as re-adding it would.
   */
  updateService(oldHost: string, name: string, host: string): Promise<ServiceDefinition[]>
  /**
   * Remove the service with this host (built-in or custom); returns the
   * updated list.
   */
  deleteService(host: string): Promise<ServiceDefinition[]>
  /**
   * The services outage timeline, newest first. Recorded by the always-on
   * backend heartbeat, so it covers outages that happened while the Services
   * tab, or the whole window, was closed.
   */
  getServiceHistory(): Promise<ServiceEvent[]>
  /** Wipe the timeline and the baseline behind it, so the next probe re-seeds. */
  clearServiceHistory(): Promise<void>
  /**
   * Fires when the services heartbeat has folded a fresh probe into the
   * timeline, so a page showing it can re-read.
   */
  onServicesTimeline(callback: () => void): Unsubscribe
  /** `runToken` names this run, so a Stop sent before the run reaches the backend still stops it. */
  runSpeedTest(runToken: string): Promise<SpeedTestResult>
  /** Stops the run with this token, now or as soon as it starts. */
  cancelSpeedTest(runToken: string): Promise<void>
  /** Past speed-test results, newest first, from the local database. */
  getSpeedHistory(): Promise<SpeedHistoryEntry[]>
  /** Persist one completed speed-test result. */
  saveSpeedResult(entry: SpeedHistoryEntry): Promise<void>
  /** Bulk-insert results (used once to migrate legacy localStorage history). */
  importSpeedHistory(entries: SpeedHistoryEntry[]): Promise<void>
  clearSpeedHistory(): Promise<void>
  onSpeedTestProgress(callback: (progress: SpeedTestProgress) => void): Unsubscribe
  /** Fires when the OS routing table changes (cable pulled, Wi-Fi joined). */
  onNetworkChanged(callback: () => void): Unsubscribe
  /**
   * Fires when the background heartbeat observes a public-internet
   * reachability change (WAN lost or restored).
   */
  onInternetStatus(callback: (status: InternetStatus) => void): Unsubscribe
  subscribeLiveThroughput(): Promise<void>
  unsubscribeLiveThroughput(): Promise<void>
  onLiveThroughput(callback: (throughput: LiveThroughput) => void): Unsubscribe
}

export type WindowControls = {
  minimize(): void
  close(): void
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Window merges only into an interface.
  interface Window {
    // Optional: the plain web build (`build:web`) ships without a bridge, so
    // every consumer must guard. Use `getNetworkApi()` where a throw is fine.
    networkAPI?: NetworkAPI
    windowControls?: WindowControls
  }
}

export {}
