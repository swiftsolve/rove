/**
 * Browser mock for the Electron `networkAPI`/`windowControls` bridge.
 *
 * When the app runs in a plain browser (e.g. viewing the Vite dev server over a
 * forwarded port), `window.networkAPI` doesn't exist because there's no Electron
 * preload. This installs a faithful, in-memory stand-in so the UI renders fully
 * populated for design/polish work. It is only wired up in dev builds and only
 * when the real bridge is absent — see `installMockNetworkApiIfNeeded`.
 */
import type {
  CapabilityLevel,
  CapabilityRating,
  LanDeviceScan,
  LiveThroughput,
  NetworkAPI,
  NetworkDiagnostics,
  NetworkInfo,
  NetworkInterfaceSummary,
  SpeedResult,
  SpeedTestProgress,
  SpeedTestResult,
  Unsubscribe,
  WindowControls,
} from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'

type CapabilityDefinitionEntry = (typeof CAPABILITY_DEFINITIONS)[number]

/** Mirrors electron/capabilities/capability-assessor.ts so mock ratings match production. */
function rateCapability(speed: SpeedResult, definition: CapabilityDefinitionEntry): CapabilityLevel {
  const { requirements } = definition
  const { downloadMbps, uploadMbps, latencyMs, jitterMs } = speed

  if (downloadMbps < requirements.minDownloadMbps * 0.5 || latencyMs > requirements.maxLatencyMs * 2) {
    return 'unsupported'
  }

  const meetsRequirements =
    downloadMbps >= requirements.minDownloadMbps &&
    uploadMbps >= requirements.minUploadMbps &&
    latencyMs <= requirements.maxLatencyMs &&
    jitterMs <= requirements.maxJitterMs

  if (meetsRequirements) {
    const isExcellent =
      downloadMbps >= requirements.minDownloadMbps * 2 && latencyMs <= requirements.maxLatencyMs * 0.5
    return isExcellent ? 'excellent' : 'good'
  }

  if (downloadMbps >= requirements.minDownloadMbps * 0.7) return 'fair'
  return 'poor'
}

function assessCapabilities(speed: SpeedResult): readonly CapabilityRating[] {
  return CAPABILITY_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    icon: definition.icon,
    level: rateCapability(speed, definition),
  }))
}

const MOCK_LINK_CAPACITY_MBPS = 866

const MOCK_NETWORK_INFO: NetworkInfo = {
  connectionType: 'wifi',
  interfaceName: 'wlan0',
  isConnected: true,
  ipAddress: '192.168.1.42',
  gateway: '192.168.1.1',
  macAddress: 'a4:c3:f0:1b:2d:9e',
  dns: ['192.168.1.1', '1.1.1.1'],
  ssid: 'Starlight_5G',
  signalStrength: 78,
  signalDbm: -54,
  channel: 44,
  frequency: 5220,
  security: 'WPA2',
  wifiStandard: 'Wi-Fi 5 (802.11ac)',
  linkSpeedMbps: MOCK_LINK_CAPACITY_MBPS,
}

const MOCK_INTERFACES: readonly NetworkInterfaceSummary[] = [
  {
    name: 'wlan0',
    connectionType: 'wifi',
    operState: 'up',
    isDefault: true,
    isVirtual: false,
    ipAddress: '192.168.1.42',
    macAddress: 'a4:c3:f0:1b:2d:9e',
    speedMbps: MOCK_LINK_CAPACITY_MBPS,
    duplex: null,
  },
  {
    name: 'eth0',
    connectionType: 'ethernet',
    operState: 'down',
    isDefault: false,
    isVirtual: false,
    ipAddress: null,
    macAddress: '3c:52:82:04:7a:11',
    speedMbps: null,
    duplex: null,
  },
  {
    name: 'docker0',
    connectionType: 'unknown',
    operState: 'down',
    isDefault: false,
    isVirtual: true,
    ipAddress: '172.17.0.1',
    macAddress: '02:42:9d:6c:8f:aa',
    speedMbps: null,
    duplex: null,
  },
  {
    name: 'lo',
    connectionType: 'unknown',
    operState: 'up',
    isDefault: false,
    isVirtual: true,
    ipAddress: '127.0.0.1',
    macAddress: null,
    speedMbps: null,
    duplex: null,
  },
]

// Captured from a real `ip neigh` scan on this network so the mock mirrors production output.
const MOCK_DEVICE_SCAN: LanDeviceScan = {
  subnet: '192.168.2.0/24',
  interfaceName: 'enp6s0',
  scannedAt: Date.now(),
  devices: [
    { ip: '192.168.2.1', hostname: 'mynetwork', kind: 'router', mac: 'bc:d5:ed:f7:5c:c5', vendor: 'Router (Zyxel)', isRandomizedMac: false, isGateway: true, isSelf: false, reachable: true },
    { ip: '192.168.2.11', hostname: 'nabil-desktop', kind: 'computer', mac: 'fc:34:97:a1:c2:c8', vendor: null, isRandomizedMac: false, isGateway: false, isSelf: true, reachable: true },
    { ip: '192.168.2.12', hostname: null, kind: 'unknown', mac: '1c:3b:f3:85:8f:43', vendor: null, isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.15', hostname: null, kind: 'unknown', mac: '98:17:3c:6d:03:1a', vendor: null, isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.16', hostname: null, kind: 'phone', mac: '96:bc:d3:21:af:00', vendor: null, isRandomizedMac: true, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.19', hostname: null, kind: 'computer', mac: '08:38:e6:d8:df:23', vendor: 'Intel', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.20', hostname: 'shelly-plug', kind: 'iot', mac: '10:96:93:e4:bf:a8', vendor: null, isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.21', hostname: null, kind: 'iot', mac: '08:3a:8d:ac:04:d0', vendor: null, isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.24', hostname: 'iPhone-15', kind: 'phone', mac: 'ec:b5:fa:18:97:79', vendor: 'Apple', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.2.25', hostname: null, kind: 'tv', mac: '5c:e7:53:3d:59:80', vendor: null, isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
  ],
}

const MOCK_DIAGNOSTICS: NetworkDiagnostics = {
  gateway: '192.168.1.1',
  defaultInterface: 'wlan0',
  dnsServers: ['192.168.1.1', '1.1.1.1', '8.8.8.8'],
  gatewayPing: { avgMs: 3.4, jitterMs: 0.8, packetLoss: 0 },
}

const MOCK_SPEED_RESULT: SpeedResult = {
  downloadMbps: 187.3,
  uploadMbps: 22.6,
  latencyMs: 18,
  jitterMs: 3.2,
  packetLoss: 0,
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Emits synthetic live-throughput samples to simulate background traffic. */
function createLiveThroughputEmitter(): Pick<
  NetworkAPI,
  'subscribeLiveThroughput' | 'unsubscribeLiveThroughput' | 'onLiveThroughput'
> {
  const listeners = new Set<(t: LiveThroughput) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  let tick = 0

  const stop = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const start = (): void => {
    if (timer) return
    timer = setInterval(() => {
      tick += 1
      // Mostly idle with occasional bursts, so idle/active states both show.
      const bursting = Math.floor(tick / 4) % 3 === 0
      const download = bursting ? 8 + Math.random() * 40 : Math.random() * 0.05
      const upload = bursting ? 1 + Math.random() * 6 : Math.random() * 0.03
      const sample: LiveThroughput = {
        downloadMbps: Number(download.toFixed(3)),
        uploadMbps: Number(upload.toFixed(3)),
        timestamp: Date.now(),
      }
      for (const listener of listeners) listener(sample)
    }, 1000)
  }

  return {
    subscribeLiveThroughput: async () => {
      start()
    },
    unsubscribeLiveThroughput: async () => {
      if (listeners.size === 0) stop()
    },
    onLiveThroughput: (callback): Unsubscribe => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
        if (listeners.size === 0) stop()
      }
    },
  }
}

function createMockNetworkApi(): NetworkAPI {
  const live = createLiveThroughputEmitter()
  const progressListeners = new Set<(p: SpeedTestProgress) => void>()
  let cancelled = false

  const emitProgress = (progress: SpeedTestProgress): void => {
    for (const listener of progressListeners) listener(progress)
  }

  return {
    getNetworkInfo: async () => {
      await delay(250)
      return MOCK_NETWORK_INFO
    },
    getPublicIp: async () => {
      await delay(400)
      return '203.0.113.57'
    },
    getInterfaces: async () => {
      await delay(300)
      return MOCK_INTERFACES
    },
    getDevices: async () => {
      await delay(900)
      return { ...MOCK_DEVICE_SCAN, scannedAt: Date.now() }
    },
    onNetworkChanged: () => () => undefined,
    getDataUsage: async () => {
      await delay(200)
      const day = 86_400_000
      const gb = 1_000_000_000
      const days = Array.from({ length: 7 }, (_, i) => {
        const when = new Date(Date.now() - (6 - i) * day)
        const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
        return {
          date: key,
          rxBytes: Math.round((0.4 + Math.abs(Math.sin(i * 2.1)) * 5.2) * gb),
          txBytes: Math.round((0.1 + Math.abs(Math.sin(i * 1.3)) * 0.9) * gb),
        }
      })
      return {
        days,
        bootRxBytes: 6_300_000_000,
        bootTxBytes: 7_400_000_000,
        trackingSince: Date.now() - 6 * day,
      }
    },
    runDiagnostics: async () => {
      await delay(700)
      return MOCK_DIAGNOSTICS
    },
    runSpeedTest: async (): Promise<SpeedTestResult> => {
      cancelled = false
      const steps: readonly SpeedTestProgress[] = [
        { phase: 'internet', message: 'Measuring latency…', progress: 10 },
        { phase: 'internet', message: 'Testing download…', progress: 40 },
        { phase: 'internet', message: 'Testing download…', progress: 65 },
        { phase: 'internet', message: 'Testing upload…', progress: 85 },
        { phase: 'internet', message: 'Finishing up…', progress: 95 },
      ]
      for (const step of steps) {
        await delay(600)
        if (cancelled) throw new Error('SPEED_TEST_CANCELLED')
        emitProgress(step)
      }
      emitProgress({ phase: 'complete', message: 'Done', progress: 100 })
      return {
        internet: MOCK_SPEED_RESULT,
        capabilities: assessCapabilities(MOCK_SPEED_RESULT),
        linkCapacityMbps: MOCK_LINK_CAPACITY_MBPS,
      }
    },
    cancelSpeedTest: async () => {
      cancelled = true
    },
    onSpeedTestProgress: (callback): Unsubscribe => {
      progressListeners.add(callback)
      return () => progressListeners.delete(callback)
    },
    subscribeLiveThroughput: live.subscribeLiveThroughput,
    unsubscribeLiveThroughput: live.unsubscribeLiveThroughput,
    onLiveThroughput: live.onLiveThroughput,
  }
}

function createMockWindowControls(): WindowControls {
  return {
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    isMaximized: async () => false,
    onMaximizedChange: (): Unsubscribe => () => {},
  }
}

/**
 * Installs the mock bridge when running in a browser without the Electron
 * preload. No-op inside Electron (where `window.networkAPI` already exists).
 * Returns true if the mock was installed.
 */
export function installMockNetworkApiIfNeeded(): boolean {
  if (typeof window === 'undefined') return false
  if (window.networkAPI) return false

  const mutableWindow = window as unknown as {
    networkAPI: NetworkAPI
    windowControls: WindowControls
  }
  mutableWindow.networkAPI = createMockNetworkApi()
  mutableWindow.windowControls = createMockWindowControls()

  // eslint-disable-next-line no-console
  console.info(
    '[beacon] Electron bridge not found — using in-browser mock network data (dev only).',
  )
  return true
}
