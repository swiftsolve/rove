/**
 * Browser mock of the `window.networkAPI`/`window.windowControls` bridge.
 *
 * When the app runs in a plain browser (e.g. viewing the Vite dev server over a
 * forwarded port), `window.networkAPI` doesn't exist because there's no Tauri
 * backend to install the real bridge (see bridge/tauriNetworkApi.ts). This
 * installs a faithful, in-memory stand-in so the UI renders fully populated for
 * design/polish work. It is only wired up in dev builds and only when the real
 * bridge is absent — see `installMockNetworkApiIfNeeded`.
 */
import type {
  CapabilityLevel,
  CapabilityRating,
  LanDevice,
  LanDeviceScan,
  LiveDiagnostics,
  LiveThroughput,
  NetworkAPI,
  NetworkDiagnostics,
  NetworkEvent,
  NetworkInfo,
  NetworkInterfaceSummary,
  ServiceDefinition,
  SpeedHistoryEntry,
  SpeedResult,
  SpeedTestProgress,
  SpeedTestResult,
  Unsubscribe,
  WifiShare,
  WindowControls,
} from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'

type CapabilityDefinitionEntry = (typeof CAPABILITY_DEFINITIONS)[number]

/** Mirrors `rate` in crates/rove-core/src/capabilities.rs so mock ratings match production. */
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

// A modern Wi-Fi 6 home connection — one subnet (192.168.1.0/24) shared across
// the connection card, diagnostics and the device scan so the demo is coherent.
const MOCK_LINK_CAPACITY_MBPS = 1200
const MOCK_SSID = 'Starlight_5G'
const MOCK_FREQUENCY = 5745
const MOCK_SELF_IP = '192.168.1.42'
const MOCK_SELF_MAC = 'a4:c3:f0:1b:2d:9e'
const MOCK_GATEWAY = '192.168.1.1'

const MOCK_NETWORK_INFO: NetworkInfo = {
  connectionType: 'wifi',
  interfaceName: 'wlan0',
  isConnected: true,
  ipAddress: MOCK_SELF_IP,
  gateway: MOCK_GATEWAY,
  macAddress: MOCK_SELF_MAC,
  dns: [MOCK_GATEWAY, '1.1.1.1'],
  ssid: MOCK_SSID,
  signalStrength: 84,
  signalDbm: -47,
  channel: 149,
  frequency: MOCK_FREQUENCY,
  security: 'WPA3',
  wifiStandard: 'Wi-Fi 6 (802.11ax)',
  linkSpeedMbps: MOCK_LINK_CAPACITY_MBPS,
}

/**
 * A decorative QR-like SVG for the browser mock. It isn't a valid, scannable
 * code — the real backend generates one with the `qrcode` crate — but it gives
 * the share dialog a faithful shape to lay out against during design work.
 */
function mockQrSvg(): string {
  const size = 25
  const quiet = 4
  const dim = size + quiet * 2
  const isFinder = (x: number, y: number): boolean => {
    const inBox = (bx: number, by: number): boolean => {
      const dx = x - bx
      const dy = y - by
      if (dx < 0 || dx > 6 || dy < 0 || dy > 6) return false
      const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6
      const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
      return ring || core
    }
    return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7)
  }
  let rects = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Finder patterns where they belong, otherwise a deterministic speckle.
      const dark = isFinder(x, y) ? true : ((x * 7 + y * 13 + x * y) % 3 === 0)
      if (dark) rects += `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<g fill="#000000">${rects}</g></svg>`
  )
}

const MOCK_WIFI_SHARE: WifiShare = {
  ssid: MOCK_SSID,
  encryption: 'WPA',
  password: 'correct-horse-battery',
  qrSvg: mockQrSvg(),
}

const MOCK_INTERFACES: readonly NetworkInterfaceSummary[] = [
  {
    name: 'wlan0',
    connectionType: 'wifi',
    operState: 'up',
    isDefault: true,
    isVirtual: false,
    ipAddress: MOCK_SELF_IP,
    macAddress: MOCK_SELF_MAC,
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

// A lived-in home network: mostly named and classified, with one offline camera,
// An Apple hardware model identifier: a product family followed by a
// "<generation>,<revision>" suffix, e.g. "iPhone15,2" or "MacBookPro18,3".
// Mirrors is_apple_model in crates/rove-core/src/devices/mod.rs.
const APPLE_MODEL_FAMILIES = [
  'iphone', 'ipad', 'ipod', 'watch', 'macbook', 'imac', 'macmini', 'macpro', 'audioaccessory',
]
function isAppleModel(model: string): boolean {
  const lower = model.trim().toLowerCase()
  return (
    lower.includes(',') &&
    /\d/.test(lower) &&
    APPLE_MODEL_FAMILIES.some((family) => lower.startsWith(family))
  )
}

// Turn a hardware model string into a human-friendly product name, matching what
// the real backend returns: it humanizes Apple mDNS/UPnP identifiers before they
// ever reach the frontend. Mirrors humanize_model in
// crates/rove-core/src/devices/mod.rs so the demo reads like production.
function humanizeModel(model: string | null): string | null {
  if (model === null || !isAppleModel(model)) return model
  // Everything before the "<gen>,<rev>" suffix is the product family.
  const family = model.trim().replace(/\d.*$/, '')
  switch (family.toLowerCase()) {
    case 'audioaccessory': return 'HomePod'
    case 'watch': return 'Apple Watch'
    case 'macmini': return 'Mac mini'
    case 'macpro': return 'Mac Pro'
    case 'macbook': return 'MacBook'
    case 'macbookpro': return 'MacBook Pro'
    case 'macbookair': return 'MacBook Air'
    // Lowercase-run families ("iphone", "ipad", "imac", "ipod") are a single
    // word; keep the identifier's own casing rather than lowercasing it.
    default: return family
  }
}

// Rows omit kindConfidence except where the hedge is the point (the vendor-only
// TP-Link plug); the map below fills in the common 'high'.
type MockLanDevice = Omit<LanDevice, 'kindConfidence' | 'lastSeen'> &
  Partial<Pick<LanDevice, 'kindConfidence' | 'lastSeen'>>

// one privacy-randomized guest phone and one genuine unknown — the messiness a
// real scan turns up. Self matches the connection card (same IP + MAC).
const MOCK_DEVICE_SCAN: LanDeviceScan = {
  subnet: '192.168.1.0/24',
  interfaceName: 'wlan0',
  scannedAt: Date.now(),
  dhcpStatus: 'active',
  devices: ([
    { ip: '192.168.1.1', hostname: 'router', model: null, os: null, kind: 'router', mac: '24:5a:4c:11:b2:03', vendor: 'Ubiquiti', isRandomizedMac: false, isGateway: true, isSelf: false, reachable: true },
    { ip: MOCK_SELF_IP, hostname: 'rove-macbook', model: 'MacBookPro18,3', os: 'macOS', kind: 'computer', mac: MOCK_SELF_MAC, vendor: 'Apple', isRandomizedMac: false, isGateway: false, isSelf: true, reachable: true },
    { ip: '192.168.1.10', hostname: 'Living-Room-TV', model: 'BRAVIA KD-65X90L', os: null, kind: 'tv', mac: '5c:e7:53:3d:59:80', vendor: 'Sony', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.12', hostname: 'Kitchen-Sonos', model: 'Sonos One', os: null, kind: 'speaker', mac: '68:57:2d:aa:0b:0c', vendor: 'Sonos', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.14', hostname: 'Office-Printer', model: 'OfficeJet Pro 9015', os: null, kind: 'printer', mac: '3c:52:82:1d:44:7e', vendor: 'HP', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.16', hostname: 'iPhone-15-Pro', model: 'iPhone16,1', os: 'iOS', kind: 'phone', mac: 'ec:b5:fa:18:97:79', vendor: 'Apple', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.18', hostname: 'Emmas-iPad', model: 'iPad13,4', os: 'iPadOS', kind: 'tablet', mac: 'a4:c3:f0:11:22:33', vendor: 'Apple', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.21', hostname: 'PlayStation-5', model: null, os: null, kind: 'console', mac: '7c:ed:8d:44:55:66', vendor: 'Sony', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.24', hostname: 'Nest-Hub', model: 'Google Nest Hub', os: null, kind: 'iot', mac: '1c:f2:9a:6d:03:1a', vendor: 'Google', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.27', hostname: 'DiskStation', model: 'DS923+', os: null, kind: 'nas', mac: '00:11:32:aa:bb:cc', vendor: 'Synology', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.30', hostname: 'Hue-Bridge', model: 'BSB002', os: null, kind: 'iot', mac: '00:17:88:2c:9f:d1', vendor: 'Signify (Philips Hue)', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.33', hostname: 'Front-Door-Cam', model: null, os: null, kind: 'camera', mac: 'ec:71:db:77:88:99', vendor: 'Reolink', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: false },
    { ip: '192.168.1.36', hostname: 'shelly-plug-s', model: null, os: null, kind: 'iot', mac: '10:96:93:e4:bf:a8', vendor: 'Allterco (Shelly)', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    { ip: '192.168.1.40', hostname: 'ecobee-thermostat', model: null, os: null, kind: 'iot', mac: '44:61:32:0a:7d:e2', vendor: 'ecobee', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
    // A privacy-randomized phone: no OUI vendor, no hostname — yet its DHCP
    // fingerprint still identifies it. This is the headline win of the feature.
    { ip: '192.168.1.44', hostname: null, model: null, os: 'Android', kind: 'phone', mac: '96:bc:d3:21:af:00', vendor: null, isRandomizedMac: true, isGateway: false, isSelf: false, reachable: true },
    // A randomized-MAC iPhone: no OUI vendor, but the backend infers "Apple" from
    // its default hostname, so it reads "Phone · Apple" rather than dropping the make.
    { ip: '192.168.1.46', hostname: 'iPhone', model: null, os: null, kind: 'phone', mac: 'ae:4a:06:fe:b5:37', vendor: 'Apple', isRandomizedMac: true, isGateway: false, isSelf: false, reachable: true },
    // A TP-Link Kasa/Tapo smart plug: its OUI resolves to the generic "TP-Link"
    // name (shared with Archer routers), so with no other signal the classifier
    // leans "Smart home", not "Network" — a low-confidence call the UI hedges.
    { ip: '192.168.1.48', hostname: null, model: null, os: null, kind: 'iot', kindConfidence: 'low', mac: '1c:3b:f3:85:8f:43', vendor: 'TP-Link', isRandomizedMac: false, isGateway: false, isSelf: false, reachable: true },
  ] satisfies readonly MockLanDevice[]).map((device) => ({
    ...device,
    model: humanizeModel(device.model),
    kindConfidence: device.kindConfidence ?? 'high',
    // Reachable devices were just seen; the offline camera is a roster device
    // merged back in, so it carries an older "last seen" to exercise the label.
    lastSeen: device.reachable ? Date.now() : Date.now() - 5 * 60 * 60_000,
  })),
}

// A few days of change history, newest first — one of each kind so the feed's
// grouping, icons and severities all show. Timestamps are relative to now so
// the day headers ("Today"/"Yesterday") stay meaningful in the demo.
function seedNetworkEvents(): NetworkEvent[] {
  const min = 60_000
  const hour = 3_600_000
  const rows: readonly (Omit<NetworkEvent, 'id' | 'ts'> & { ago: number })[] = [
    { ago: 3 * min, type: 'wifi_connected', severity: 'info', mac: MOCK_SELF_MAC, ip: MOCK_SELF_IP, name: MOCK_SSID, kind: null, oldValue: null, newValue: null, randomized: false },
    { ago: 8 * min, type: 'device_joined', severity: 'info', mac: '96:bc:d3:21:af:00', ip: '192.168.1.44', name: 'Android device', kind: 'phone', oldValue: null, newValue: null, randomized: true },
    { ago: 2 * hour, type: 'ethernet_connected', severity: 'info', mac: MOCK_SELF_MAC, ip: '192.168.1.51', name: 'en0', kind: null, oldValue: null, newValue: null, randomized: false },
    { ago: 40 * min, type: 'ap_appeared', severity: 'warning', mac: '24:5a:4c:88:19:2f', ip: '192.168.1.3', name: 'Ubiquiti', kind: 'router', oldValue: null, newValue: null, randomized: false },
    { ago: 5 * hour, type: 'device_offline', severity: 'info', mac: 'ec:71:db:77:88:99', ip: '192.168.1.33', name: 'Front-Door-Cam', kind: 'camera', oldValue: null, newValue: null, randomized: false },
    { ago: 28 * hour, type: 'device_online', severity: 'info', mac: 'ec:71:db:77:88:99', ip: '192.168.1.33', name: 'Front-Door-Cam', kind: 'camera', oldValue: null, newValue: null, randomized: false },
    { ago: 30 * hour, type: 'gateway_changed', severity: 'critical', mac: '24:5a:4c:11:b2:03', ip: '192.168.1.1', name: 'Router', kind: null, oldValue: '9c:a2:f4:00:1d:e2', newValue: '24:5a:4c:11:b2:03', randomized: false },
    { ago: 34 * hour, type: 'initial_scan', severity: 'info', mac: null, ip: null, name: null, kind: null, oldValue: null, newValue: '17', randomized: false },
  ]
  // Serve newest-first, mirroring the backend's `ORDER BY ts DESC`. The rows
  // above are authored out of strict time order, so sort by age before stamping
  // ids/timestamps — otherwise the timeline's day grouping (which assumes a
  // time-ordered feed) can emit two sections for the same day. Newer events get
  // the higher id, matching the store's AUTOINCREMENT.
  const ordered = [...rows].sort((a, b) => a.ago - b.ago)
  return ordered.map(({ ago, ...rest }, i) => ({ ...rest, id: ordered.length - i, ts: Date.now() - ago }))
}

// The user's editable service list, seeded with the built-in defaults. Add /
// delete mutate this in place so listServices and the diagnostics probes below
// all read the same source of truth — mirroring the SQLite-backed real store.
const mockServices: ServiceDefinition[] = [
  { name: 'Google', host: 'google.com' },
  { name: 'Cloudflare', host: 'cloudflare.com' },
  { name: 'YouTube', host: 'youtube.com' },
  { name: 'Netflix', host: 'netflix.com' },
  { name: 'Zoom', host: 'zoom.us' },
  // A custom, self-hosted service standing in for a user-added entry that's down.
  { name: 'Home Server', host: 'homeserver.local' },
]

// A stable-ish baseline latency per host so the card doesn't reshuffle each poll.
function mockLatencyFor(host: string): number {
  const seed = [...host].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return Math.round((20 + (seed % 90)) * 10) / 10
}

// The mock has no real network to probe, so it can only vouch for the well-known
// public services it ships with. Anything else — the seeded self-hosted box, or
// any custom host the user adds (an internal `*.local`, or a hostname that isn't
// actually serving) — reads as Down rather than pretending an arbitrary
// name answered. This is the single reachability verdict both the diagnostics
// list and the "test before add" dialog consult, so they always agree.
const MOCK_REACHABLE_HOSTS = new Set([
  'google.com',
  'cloudflare.com',
  'youtube.com',
  'netflix.com',
  'zoom.us',
])

function mockIsReachable(host: string): boolean {
  return MOCK_REACHABLE_HOSTS.has(host.trim().toLowerCase())
}

function mockServiceReachability(): NetworkDiagnostics['services'] {
  return mockServices.map((s) =>
    mockIsReachable(s.host)
      ? { ...s, latencyMs: mockLatencyFor(s.host), httpStatus: 200 }
      : { ...s, latencyMs: null, httpStatus: null },
  )
}

const MOCK_DIAGNOSTICS: NetworkDiagnostics = {
  gateway: MOCK_GATEWAY,
  defaultInterface: 'wlan0',
  dnsServers: [MOCK_GATEWAY, '1.1.1.1', '8.8.8.8'],
  gatewayPing: { avgMs: 2.1, jitterMs: 0.4, packetLoss: 0 },
  gatewayVendor: 'Sagemcom Broadband SAS',
  gatewayModel: 'RouterOS RB750Gr3',
  isp: {
    name: 'Comcast Cable Communications',
    asn: 'AS7922',
    city: 'San Francisco',
    region: 'California',
    country: 'United States',
    publicIp: '203.0.113.57',
  },
  services: mockServiceReachability(),
}

const MOCK_SPEED_RESULT: SpeedResult = {
  downloadMbps: 623.4,
  uploadMbps: 41.8,
  latencyMs: 11,
  jitterMs: 1.6,
  packetLoss: 0,
}

// Context stamped onto every recorded/seeded result, matching the connection.
const MOCK_SPEED_CONTEXT = {
  connectionType: 'wifi',
  networkName: MOCK_SSID,
  linkSpeedMbps: MOCK_LINK_CAPACITY_MBPS,
  frequency: MOCK_FREQUENCY,
} as const

// A couple of weeks of history so the "View history" trend isn't empty. Newest
// first; values wobble around the current result the way a real link does.
function seedSpeedHistory(): SpeedHistoryEntry[] {
  const hour = 3_600_000
  const points: readonly (Omit<SpeedResult, never> & { agoHours: number })[] = [
    { downloadMbps: 611.2, uploadMbps: 40.6, latencyMs: 12, jitterMs: 1.9, packetLoss: 0, agoHours: 6 },
    { downloadMbps: 598.7, uploadMbps: 39.1, latencyMs: 13, jitterMs: 2.4, packetLoss: 0, agoHours: 27 },
    { downloadMbps: 642.9, uploadMbps: 42.3, latencyMs: 10, jitterMs: 1.4, packetLoss: 0, agoHours: 52 },
    { downloadMbps: 570.4, uploadMbps: 38.0, latencyMs: 15, jitterMs: 3.1, packetLoss: 0, agoHours: 74 },
    { downloadMbps: 629.1, uploadMbps: 41.5, latencyMs: 11, jitterMs: 1.7, packetLoss: 0, agoHours: 121 },
    { downloadMbps: 604.8, uploadMbps: 40.0, latencyMs: 12, jitterMs: 2.0, packetLoss: 0, agoHours: 168 },
    { downloadMbps: 583.3, uploadMbps: 37.6, latencyMs: 14, jitterMs: 2.7, packetLoss: 1, agoHours: 240 },
    { downloadMbps: 655.0, uploadMbps: 43.1, latencyMs: 10, jitterMs: 1.3, packetLoss: 0, agoHours: 312 },
  ]
  return points.map(({ agoHours, ...speed }) => ({
    ...speed,
    ...MOCK_SPEED_CONTEXT,
    timestamp: Date.now() - agoHours * hour,
  }))
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Smoothstep easing (0..1) for organic-looking ramps. */
function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

function createMockNetworkApi(): NetworkAPI {
  const progressListeners = new Set<(p: SpeedTestProgress) => void>()
  let cancelled = false

  // ---- live throughput ----
  // A single 1 Hz sampler feeds the Home "Live traffic" widget. While a speed
  // test runs it saturates the link, so the live reading IS the test's
  // throughput: `testTraffic` holds that instantaneous rate and the sampler
  // emits it, which is what makes the Speed view's Download/Upload numbers climb
  // during a test (SpeedView tracks their running peak). When null, the sampler
  // falls back to a gentle idle/burst pattern.
  const liveListeners = new Set<(t: LiveThroughput) => void>()
  let liveTimer: ReturnType<typeof setInterval> | null = null
  let idleTick = 0
  let testTraffic: { downloadMbps: number; uploadMbps: number } | null = null

  const emitLive = (downloadMbps: number, uploadMbps: number): void => {
    const sample: LiveThroughput = {
      downloadMbps: Number(Math.max(0, downloadMbps).toFixed(3)),
      uploadMbps: Number(Math.max(0, uploadMbps).toFixed(3)),
      timestamp: Date.now(),
    }
    for (const listener of liveListeners) listener(sample)
  }

  const idleSample = (): { down: number; up: number } => {
    idleTick += 1
    // Mostly quiet, with a periodic streaming/backup burst so the chart is alive
    // and both idle and active states show.
    const streaming = Math.floor(idleTick / 6) % 4 === 0
    const nudge = Math.floor(idleTick / 3) % 5 === 0
    if (streaming) {
      return { down: 22 + Math.random() * 46, up: 0.8 + Math.random() * 3.2 }
    }
    if (nudge) {
      return { down: 1.5 + Math.random() * 6, up: 0.2 + Math.random() * 1.1 }
    }
    return { down: 0.02 + Math.random() * 0.06, up: 0.01 + Math.random() * 0.03 }
  }

  const startLive = (): void => {
    if (liveTimer) return
    liveTimer = setInterval(() => {
      if (testTraffic) {
        // Light ±3% jitter so the driven line reads as live, not flat.
        const j = 0.97 + Math.random() * 0.06
        emitLive(testTraffic.downloadMbps * j, testTraffic.uploadMbps * j)
        return
      }
      const { down, up } = idleSample()
      emitLive(down, up)
    }, 1000)
  }

  const stopLive = (): void => {
    if (liveTimer) {
      clearInterval(liveTimer)
      liveTimer = null
    }
  }

  const emitProgress = (progress: SpeedTestProgress): void => {
    for (const listener of progressListeners) listener(progress)
  }

  // ---- speed history (in-memory; seeded, resets on reload) ----
  let mockHistory: SpeedHistoryEntry[] = seedSpeedHistory()
  // ---- network-change feed (in-memory; seeded, resets on reload) ----
  const mockEvents: NetworkEvent[] = seedNetworkEvents()

  return {
    getNetworkInfo: async () => {
      await delay(250)
      return MOCK_NETWORK_INFO
    },
    getWifiShare: async () => {
      await delay(300)
      return MOCK_WIFI_SHARE
    },
    getPublicIp: async () => {
      await delay(400)
      return '203.0.113.57'
    },
    getInterfaces: async () => {
      await delay(300)
      return MOCK_INTERFACES
    },
    // The scan indicator beside the subnet (pulsing dot + "Sweeping →
    // Listening → Identifying") only shows while a scan with results is in
    // flight, and each stage holds ~1.3s. So the first scan resolves fast for a
    // snappy first paint, while a manual rescan (the refresh button) runs long
    // enough to walk all three stages before the results land — which is what
    // makes the indicator visible in the landing-page demo.
    getDevices: (() => {
      let scans = 0
      return async () => {
        scans += 1
        await delay(scans === 1 ? 700 : 3600)
        return { ...MOCK_DEVICE_SCAN, scannedAt: Date.now() }
      }
    })(),
    onNetworkChanged: () => () => undefined,
    getNetworkEvents: async () => {
      await delay(200)
      return mockEvents
    },
    getDataUsage: async () => {
      await delay(200)
      const day = 86_400_000
      const gb = 1_000_000_000
      // A believable week — lighter midweek, heavier on the weekend, today still
      // filling in. Index 0 is six days ago, index 6 is today. [downGB, upGB].
      const byDay: readonly [number, number][] = [
        [5.1, 0.7],
        [3.4, 0.5],
        [6.2, 0.9],
        [8.7, 1.2],
        [11.8, 1.9],
        [16.4, 2.3],
        [4.9, 0.6],
      ]
      const days = byDay.map(([down, up], i) => {
        const when = new Date(Date.now() - (6 - i) * day)
        const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
        return {
          date: key,
          rxBytes: Math.round(down * gb),
          txBytes: Math.round(up * gb),
        }
      })
      return {
        days,
        bootRxBytes: 23_400_000_000,
        bootTxBytes: 3_100_000_000,
        trackingSince: Date.now() - 6 * day,
      }
    },
    runDiagnostics: async () => {
      await delay(700)
      return { ...MOCK_DIAGNOSTICS, services: mockServiceReachability() }
    },
    // Wobble the live numbers around their baselines each poll so the count-up
    // animation is visibly exercised in the browser mock.
    runDiagnosticsLive: async (): Promise<LiveDiagnostics> => {
      await delay(300)
      const wobble = (base: number, spread: number): number =>
        Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10
      const basePing = MOCK_DIAGNOSTICS.gatewayPing
      return {
        gatewayPing: basePing
          ? {
              avgMs: Math.max(0.1, wobble(basePing.avgMs, 3)),
              jitterMs: Math.max(0, wobble(basePing.jitterMs, 1)),
              packetLoss: basePing.packetLoss,
            }
          : null,
        services: mockServiceReachability().map((service) => ({
          ...service,
          latencyMs:
            service.latencyMs == null
              ? null
              : Math.max(1, wobble(service.latencyMs, 12)),
        })),
      }
    },
    testService: async (host: string) => {
      // A ~probe delay, then the same reachability verdict the diagnostics list
      // uses — so a host that shows Down in the list also fails the
      // test-before-add check, instead of the two disagreeing.
      await delay(650)
      return mockIsReachable(host) ? mockLatencyFor(host) : null
    },
    listServices: async () => {
      await delay(120)
      return mockServices.map((s) => ({ ...s }))
    },
    addService: async (name: string, host: string) => {
      await delay(160)
      const existing = mockServices.findIndex((s) => s.host === host)
      if (existing >= 0) mockServices[existing] = { name, host }
      else mockServices.push({ name, host })
      return mockServices.map((s) => ({ ...s }))
    },
    deleteService: async (host: string) => {
      await delay(160)
      const at = mockServices.findIndex((s) => s.host === host)
      if (at >= 0) mockServices.splice(at, 1)
      return mockServices.map((s) => ({ ...s }))
    },
    runSpeedTest: async (): Promise<SpeedTestResult> => {
      cancelled = false
      const { downloadMbps: DOWN, uploadMbps: UP } = MOCK_SPEED_RESULT

      // A realistic ~10 s test, stepped every 200 ms. Progress bands line up with
      // the UI's reveal thresholds (Download cell at 15 %, Upload at 55 %) and the
      // wavy progress bar's steps [0, 15, 55, 85, 100].
      const TICK_MS = 200
      const phases = [
        { name: 'latency', message: 'Measuring latency…', durMs: 1400, from: 0, to: 14 },
        { name: 'download', message: 'Testing download…', durMs: 4600, from: 15, to: 54 },
        { name: 'upload', message: 'Testing upload…', durMs: 3600, from: 55, to: 84 },
        { name: 'finish', message: 'Finishing up…', durMs: 800, from: 85, to: 99 },
      ] as const

      for (const phase of phases) {
        const ticks = Math.max(1, Math.round(phase.durMs / TICK_MS))
        for (let i = 1; i <= ticks; i += 1) {
          await delay(TICK_MS)
          if (cancelled) {
            testTraffic = null
            throw new Error('SPEED_TEST_CANCELLED')
          }
          const pf = i / ticks // fraction through this phase, 0..1

          if (phase.name === 'download') {
            // Quick rise, then hold near the achieved rate with a little wobble.
            const ramp = smoothstep(pf * 1.5)
            testTraffic = {
              downloadMbps: DOWN * ramp * (0.98 + Math.random() * 0.04),
              uploadMbps: 0.05 + Math.random() * 0.1,
            }
          } else if (phase.name === 'upload') {
            const ramp = smoothstep(pf * 1.5)
            testTraffic = {
              downloadMbps: DOWN * 0.03 * (1 - pf), // download tapers as upload takes over
              uploadMbps: UP * ramp * (0.98 + Math.random() * 0.04),
            }
          } else {
            // latency / finish — link mostly quiet
            testTraffic = {
              downloadMbps: 0.05 + Math.random() * 0.12,
              uploadMbps: 0.03 + Math.random() * 0.06,
            }
          }

          emitProgress({
            phase: 'internet',
            message: phase.message,
            progress: phase.from + (phase.to - phase.from) * pf,
          })
        }
      }

      testTraffic = null
      emitProgress({ phase: 'complete', message: 'Done', progress: 100 })
      return {
        internet: MOCK_SPEED_RESULT,
        capabilities: assessCapabilities(MOCK_SPEED_RESULT),
        linkCapacityMbps: MOCK_LINK_CAPACITY_MBPS,
      }
    },
    cancelSpeedTest: async () => {
      cancelled = true
      testTraffic = null
    },
    getSpeedHistory: async () => mockHistory,
    saveSpeedResult: async (entry: SpeedHistoryEntry) => {
      mockHistory = [entry, ...mockHistory].slice(0, 50)
    },
    importSpeedHistory: async (entries: readonly SpeedHistoryEntry[]) => {
      mockHistory = [...entries, ...mockHistory].slice(0, 50)
    },
    clearSpeedHistory: async () => {
      mockHistory = []
    },
    onSpeedTestProgress: (callback): Unsubscribe => {
      progressListeners.add(callback)
      return () => {
        progressListeners.delete(callback)
      }
    },
    subscribeLiveThroughput: async () => {
      startLive()
    },
    unsubscribeLiveThroughput: async () => {
      if (liveListeners.size === 0) stopLive()
    },
    onLiveThroughput: (callback): Unsubscribe => {
      liveListeners.add(callback)
      return () => {
        liveListeners.delete(callback)
        if (liveListeners.size === 0) stopLive()
      }
    },
  }
}

function createMockWindowControls(): WindowControls {
  return {
    minimize: () => {},
    close: () => {},
  }
}

/**
 * Installs the mock bridge when running in a browser without the Tauri
 * backend. No-op inside Tauri (where `window.networkAPI` already exists).
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

  console.info(
    '[rove] Tauri bridge not found, using in-browser mock network data (dev only).',
  )
  return true
}
