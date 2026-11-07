/**
 * Browser mock of the `window.networkAPI` and `window.windowControls` bridge.
 *
 * A plain browser (the Vite dev server, a screenshot run, the site demo) has
 * no Tauri backend to install the real bridge (bridge/tauri-network-api.ts),
 * so this installs an in-memory stand-in that fakes time as well as data and
 * the UI renders fully populated. main.tsx loads it only in dev builds, and
 * `installMockNetworkApiIfNeeded` only when the real bridge is absent.
 */
import type { LatencySample } from '@/features/services/utils/service-latency'
import { MAX_SAMPLES, seedLatencyHistory } from '@/features/services/utils/service-latency'
import type {
  AppUsageSummary,
  CapabilityLevel,
  CapabilityRating,
  CapabilityRequirement,
  HostUsageSummary,
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
  ServiceEvent,
  ServicesReport,
  SpeedHistoryEntry,
  SpeedResult,
  SpeedTestProgress,
  SpeedTestResult,
  TrafficUsageSummary,
  Unsubscribe,
  WifiShare,
  WindowControls,
} from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'

type CapabilityDefinitionEntry = (typeof CAPABILITY_DEFINITIONS)[number]

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
// Decimal units, as the usage views format bytes.
const MB = 1_000_000
const GB = 1_000_000_000

/** Whether `value` is within `limit` scaled by `factor`; no limit always is. */
function isWithin(value: number, limit: number | null, factor: number): boolean {
  return limit === null || value <= limit * factor
}

/** Mirrors `rate` in crates/rove-core/src/capabilities.rs so mock ratings match production. */
function rateCapability(speed: SpeedResult, definition: CapabilityDefinitionEntry): CapabilityLevel {
  const requirements: CapabilityRequirement = definition.requirements
  const { downloadMbps, uploadMbps, latencyMs, jitterMs } = speed

  const isUnusable =
    downloadMbps < requirements.minDownloadMbps * 0.5 || !isWithin(latencyMs, requirements.maxLatencyMs, 2)
  if ((requirements.canBeUnsupported ?? true) && isUnusable) return 'unsupported'

  const meetsRequirements =
    downloadMbps >= requirements.minDownloadMbps &&
    uploadMbps >= requirements.minUploadMbps &&
    isWithin(latencyMs, requirements.maxLatencyMs, 1) &&
    isWithin(jitterMs, requirements.maxJitterMs, 1)

  if (meetsRequirements) {
    const isExcellent =
      downloadMbps >= requirements.minDownloadMbps * 2 && isWithin(latencyMs, requirements.maxLatencyMs, 0.5)
    return isExcellent ? 'excellent' : 'good'
  }

  if (downloadMbps >= requirements.minDownloadMbps * 0.7) return 'fair'
  return 'poor'
}

function assessCapabilities(speed: SpeedResult): CapabilityRating[] {
  return CAPABILITY_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    icon: definition.icon,
    level: rateCapability(speed, definition),
  }))
}

// A modern Wi-Fi 6 home connection. One subnet (192.168.1.0/24) is shared by
// the connection card, diagnostics and the device scan so the demo is coherent.
const MOCK_LINK_CAPACITY_MBPS = 1200
const MOCK_SSID = 'Starlight_5G'
const MOCK_FREQUENCY = 5745
const MOCK_SELF_IP = '192.168.1.42'
const MOCK_SELF_MAC = 'a4:c3:f0:1b:2d:9e'
const MOCK_GATEWAY = '192.168.1.1'
const MOCK_ETHERNET_ADAPTER = 'en5'
// Realtek's prefix: the chip in most USB-C Ethernet adapters.
const MOCK_ETHERNET_MAC = '00:e0:4c:68:12:7a'

const MOCK_NETWORK_INFO: NetworkInfo = {
  connectionType: 'wifi',
  interfaceName: 'en0',
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
 * A decorative QR-like SVG. It doesn't scan (the backend makes the real one
 * with the `qrcode` crate), but gives the share dialog a faithful shape.
 */
export function mockQrSvg(): string {
  const size = 25
  // The blank margin a scanner needs around the code.
  const quietZone = 4
  const side = size + quietZone * 2
  // The three 7x7 corner squares a scanner locks onto.
  const finderSize = 7
  const finderEdge = finderSize - 1
  const isFinder = (x: number, y: number): boolean => {
    const isInBox = (bx: number, by: number): boolean => {
      const dx = x - bx
      const dy = y - by
      if (dx < 0 || dx > finderEdge || dy < 0 || dy > finderEdge) return false
      const isOnRing = dx === 0 || dx === finderEdge || dy === 0 || dy === finderEdge
      const isInCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
      return isOnRing || isInCore
    }
    return isInBox(0, 0) || isInBox(size - finderSize, 0) || isInBox(0, size - finderSize)
  }
  let rects = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Finder patterns where they belong, otherwise a deterministic speckle.
      const isDark = isFinder(x, y) || (x * 7 + y * 13 + x * y) % 3 === 0
      if (isDark) rects += `<rect x="${x + quietZone}" y="${y + quietZone}" width="1" height="1"/>`
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
    `<rect width="${side}" height="${side}" fill="#ffffff"/>` +
    `<g fill="#000000">${rects}</g></svg>`
  )
}

const MOCK_WIFI_SHARE: WifiShare = {
  ssid: MOCK_SSID,
  encryption: 'WPA',
  password: 'correct-horse-battery',
  qrSvg: mockQrSvg(),
}

const MOCK_INTERFACES: NetworkInterfaceSummary[] = [
  {
    name: 'en0',
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
    // A USB-C Ethernet adapter, unplugged (see the seeded events).
    name: MOCK_ETHERNET_ADAPTER,
    connectionType: 'ethernet',
    operState: 'down',
    isDefault: false,
    isVirtual: false,
    ipAddress: null,
    macAddress: MOCK_ETHERNET_MAC,
    speedMbps: null,
    duplex: null,
  },
  {
    name: 'bridge0',
    connectionType: 'virtual',
    operState: 'down',
    isDefault: false,
    isVirtual: true,
    ipAddress: null,
    macAddress: '36:a1:0f:5c:e2:40',
    speedMbps: null,
    duplex: null,
  },
  {
    name: 'lo0',
    connectionType: 'virtual',
    operState: 'up',
    isDefault: false,
    isVirtual: true,
    ipAddress: '127.0.0.1',
    macAddress: null,
    speedMbps: null,
    duplex: null,
  },
]

// An Apple hardware model identifier: a product family followed by a
// "<generation>,<revision>" suffix, e.g. "iPhone15,2" or "MacBookPro18,3".
// Mirrors is_apple_model in crates/rove-core/src/devices.rs.
const APPLE_MODEL_FAMILIES = [
  'iphone',
  'ipad',
  'ipod',
  'watch',
  'macbook',
  'imac',
  'macmini',
  'macpro',
  'audioaccessory',
]
function isAppleModel(model: string): boolean {
  const lower = model.trim().toLowerCase()
  return lower.includes(',') && /\d/.test(lower) && APPLE_MODEL_FAMILIES.some((family) => lower.startsWith(family))
}

// The backend humanizes Apple mDNS/UPnP identifiers before they reach the UI,
// so the mock does too. Mirrors humanize_model in
// crates/rove-core/src/devices.rs so the demo reads like production.
function humanizeModel(model: string | null): string | null {
  if (model === null || !isAppleModel(model)) return model
  // Everything before the "<gen>,<rev>" suffix is the product family.
  const family = model.trim().replace(/\d.*$/, '')
  switch (family.toLowerCase()) {
    case 'audioaccessory':
      return 'HomePod'
    case 'watch':
      return 'Apple Watch'
    case 'macmini':
      return 'Mac mini'
    case 'macpro':
      return 'Mac Pro'
    case 'macbook':
      return 'MacBook'
    case 'macbookpro':
      return 'MacBook Pro'
    case 'macbookair':
      return 'MacBook Air'
    // Lowercase-run families ("iphone", "ipad", "imac", "ipod") are a single
    // word; keep the identifier's own casing rather than lowercasing it.
    default:
      return family
  }
}

// Rows omit kindConfidence except where the hedge is the point (the vendor-only
// TP-Link plug); the map below fills in the common 'high'.
type MockLanDevice = Omit<LanDevice, 'kindConfidence' | 'lastSeen'> &
  Partial<Pick<LanDevice, 'kindConfidence' | 'lastSeen'>>

// A lived-in home network: mostly named and classified, with one offline
// camera, two privacy-randomized phones and one low-confidence guess, the
// messiness a real scan turns up. Self matches the connection card (IP and MAC).
const MOCK_DEVICE_SCAN: LanDeviceScan = {
  subnet: '192.168.1.0/24',
  interfaceName: 'en0',
  scannedAt: Date.now(),
  dhcpStatus: 'active',
  devices: (
    [
      {
        ip: '192.168.1.1',
        hostname: 'router',
        model: 'UniFi Dream Router',
        os: null,
        kind: 'router',
        mac: '24:5a:4c:11:b2:03',
        vendor: 'Ubiquiti',
        isRandomizedMac: false,
        isGateway: true,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: MOCK_SELF_IP,
        hostname: 'rove-macbook',
        model: 'MacBookPro18,3',
        os: 'macOS',
        kind: 'computer',
        mac: MOCK_SELF_MAC,
        vendor: 'Apple',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: true,
        isReachable: true,
      },
      {
        ip: '192.168.1.10',
        hostname: 'Living-Room-TV',
        model: 'BRAVIA KD-65X90L',
        os: null,
        kind: 'tv',
        mac: '5c:e7:53:3d:59:80',
        vendor: 'Sony',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.12',
        hostname: 'Kitchen-Sonos',
        model: 'Sonos One',
        os: null,
        kind: 'speaker',
        mac: '68:57:2d:aa:0b:0c',
        vendor: 'Sonos',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.14',
        hostname: 'Office-Printer',
        model: 'OfficeJet Pro 9015',
        os: null,
        kind: 'printer',
        mac: '3c:52:82:1d:44:7e',
        vendor: 'HP',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.16',
        hostname: 'iPhone-15-Pro',
        model: 'iPhone16,1',
        os: 'iOS',
        kind: 'phone',
        mac: 'ec:b5:fa:18:97:79',
        vendor: 'Apple',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.18',
        hostname: 'Emmas-iPad',
        model: 'iPad13,4',
        os: 'iPadOS',
        kind: 'tablet',
        mac: 'a4:c3:f0:11:22:33',
        vendor: 'Apple',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.21',
        hostname: 'PlayStation-5',
        model: null,
        os: null,
        kind: 'console',
        mac: '7c:ed:8d:44:55:66',
        vendor: 'Sony',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.24',
        hostname: 'Nest-Hub',
        model: 'Google Nest Hub',
        os: null,
        kind: 'iot',
        mac: '1c:f2:9a:6d:03:1a',
        vendor: 'Google',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.27',
        hostname: 'DiskStation',
        model: 'DS923+',
        os: null,
        kind: 'nas',
        mac: '00:11:32:aa:bb:cc',
        vendor: 'Synology',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.30',
        hostname: 'Hue-Bridge',
        model: 'BSB002',
        os: null,
        kind: 'iot',
        mac: '00:17:88:2c:9f:d1',
        vendor: 'Signify (Philips Hue)',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.33',
        hostname: 'Front-Door-Cam',
        model: null,
        os: null,
        kind: 'camera',
        mac: 'ec:71:db:77:88:99',
        vendor: 'Reolink',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: false,
      },
      {
        ip: '192.168.1.36',
        hostname: 'shelly-plug-s',
        model: null,
        os: null,
        kind: 'iot',
        mac: '10:96:93:e4:bf:a8',
        vendor: 'Allterco (Shelly)',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      {
        ip: '192.168.1.40',
        hostname: 'ecobee-thermostat',
        model: null,
        os: null,
        kind: 'iot',
        mac: '44:61:32:0a:7d:e2',
        vendor: 'ecobee',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      // A privacy-randomized phone: no OUI vendor, no hostname, yet its DHCP
      // fingerprint still identifies it. The headline win of fingerprinting.
      {
        ip: '192.168.1.44',
        hostname: null,
        model: null,
        os: 'Android',
        kind: 'phone',
        mac: '96:bc:d3:21:af:00',
        vendor: null,
        isRandomizedMac: true,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      // A randomized-MAC iPhone: no OUI vendor, but the backend infers "Apple"
      // from its default hostname, so the row keeps the make.
      {
        ip: '192.168.1.46',
        hostname: 'iPhone',
        model: null,
        os: null,
        kind: 'phone',
        mac: 'ae:4a:06:fe:b5:37',
        vendor: 'Apple',
        isRandomizedMac: true,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
      // A TP-Link Kasa/Tapo smart plug: its OUI resolves to the generic "TP-Link"
      // (shared with Archer routers), so with no other signal the classifier
      // leans "Smart home" over "Network", a low-confidence call the UI hedges.
      {
        ip: '192.168.1.48',
        hostname: null,
        model: null,
        os: null,
        kind: 'iot',
        kindConfidence: 'low',
        mac: '1c:3b:f3:85:8f:43',
        vendor: 'TP-Link',
        isRandomizedMac: false,
        isGateway: false,
        isSelf: false,
        isReachable: true,
      },
    ] satisfies MockLanDevice[]
  ).map((device) => ({
    ...device,
    model: humanizeModel(device.model),
    kindConfidence: device.kindConfidence ?? 'high',
    // Reachable devices were just seen; the offline camera is a roster device
    // merged back in, so it carries an older "last seen" to exercise the label.
    lastSeen: device.isReachable ? Date.now() : Date.now() - 5 * HOUR_MS,
  })),
}

// A few days of change history, one of each kind so the feed's grouping, icons
// and severities all show. Timestamps are relative to now so the day headers
// ("Today", "Yesterday") stay meaningful in the demo.
function seedNetworkEvents(): NetworkEvent[] {
  const rows: (Omit<NetworkEvent, 'id' | 'ts'> & { ago: number })[] = [
    {
      ago: 74 * MINUTE_MS,
      type: 'wifi_connected',
      severity: 'info',
      mac: MOCK_SELF_MAC,
      ip: MOCK_SELF_IP,
      name: MOCK_SSID,
      kind: null,
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 8 * MINUTE_MS,
      type: 'device_joined',
      severity: 'info',
      mac: '96:bc:d3:21:af:00',
      ip: '192.168.1.44',
      name: 'Android device',
      kind: 'phone',
      oldValue: null,
      newValue: null,
      isRandomized: true,
    },
    {
      ago: 2 * HOUR_MS,
      type: 'ethernet_connected',
      severity: 'info',
      mac: MOCK_ETHERNET_MAC,
      ip: '192.168.1.51',
      name: MOCK_ETHERNET_ADAPTER,
      kind: null,
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 75 * MINUTE_MS,
      type: 'connection_lost',
      severity: 'warning',
      mac: null,
      ip: null,
      name: MOCK_ETHERNET_ADAPTER,
      kind: null,
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 27 * HOUR_MS,
      type: 'internet_lost',
      severity: 'warning',
      mac: null,
      ip: null,
      name: null,
      kind: null,
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 26 * HOUR_MS,
      type: 'internet_restored',
      severity: 'info',
      mac: null,
      ip: null,
      name: null,
      kind: null,
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 40 * MINUTE_MS,
      type: 'ap_appeared',
      severity: 'warning',
      mac: '24:5a:4c:88:19:2f',
      ip: '192.168.1.3',
      name: 'Ubiquiti',
      kind: 'router',
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 5 * HOUR_MS,
      type: 'device_offline',
      severity: 'info',
      mac: 'ec:71:db:77:88:99',
      ip: '192.168.1.33',
      name: 'Front-Door-Cam',
      kind: 'camera',
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 28 * HOUR_MS,
      type: 'device_online',
      severity: 'info',
      mac: 'ec:71:db:77:88:99',
      ip: '192.168.1.33',
      name: 'Front-Door-Cam',
      kind: 'camera',
      oldValue: null,
      newValue: null,
      isRandomized: false,
    },
    {
      ago: 30 * HOUR_MS,
      type: 'gateway_changed',
      severity: 'critical',
      mac: '24:5a:4c:11:b2:03',
      ip: '192.168.1.1',
      name: 'Router',
      kind: null,
      oldValue: '9c:a2:f4:00:1d:e2',
      newValue: '24:5a:4c:11:b2:03',
      isRandomized: false,
    },
    {
      ago: 34 * HOUR_MS,
      type: 'initial_scan',
      severity: 'info',
      mac: null,
      ip: null,
      name: null,
      kind: null,
      oldValue: null,
      newValue: '17',
      isRandomized: false,
    },
  ]
  // Serve newest first, like the backend's `ORDER BY ts DESC`. The rows above
  // are out of time order, and the timeline's day grouping assumes an ordered
  // feed (else it emits two sections for one day), so sort by age before
  // stamping. Newer events get the higher id, like the store's AUTOINCREMENT.
  const ordered = [...rows].sort((a, b) => a.ago - b.ago)
  return ordered.map(({ ago, ...rest }, i) => ({ ...rest, id: ordered.length - i, ts: Date.now() - ago }))
}

// A believable session: a browser dominating, a music stream, a couple of
// background sync and update daemons. [name, downMB, upMB], busiest first as
// the real sampler returns them. Every name needs an entry in getHostUsage:
// each Apps row links into that app's host group.
const MOCK_APP_ROWS: [string, number, number][] = [
  ['firefox', 842, 63],
  ['Spotify', 214, 8],
  ['com.apple.WebKit.Networking', 118, 11],
  ['Dropbox', 47, 96],
  ['slack', 39, 12],
  ['softwareupdated', 31, 1],
  ['ssh', 4, 27],
]

// The user's editable service list, seeded with the built-in defaults. The
// add, update and delete calls mutate it in place so listServices and the
// probes below read one source of truth, as the SQLite store does.
const mockServices: ServiceDefinition[] = [
  { name: 'Google', host: 'google.com' },
  { name: 'Cloudflare', host: 'cloudflare.com' },
  { name: 'YouTube', host: 'youtube.com' },
  { name: 'Netflix', host: 'netflix.com' },
  { name: 'Zoom', host: 'zoom.us' },
  // A custom, self-hosted service standing in for a user-added entry that's down.
  { name: 'Home Server', host: 'homeserver.local' },
]

/** Like the store: a host already listed takes the new label in place, any other is appended. */
function upsertMockService(name: string, host: string): void {
  const existing = mockServices.findIndex((s) => s.host === host)
  if (existing >= 0) mockServices[existing] = { name, host }
  else mockServices.push({ name, host })
}

// A seeded timeline reaching about two days back, so the Services timeline has
// days to group and durations to render. The backend's heartbeat records the
// real one.
const mockServiceHistory: ServiceEvent[] = (() => {
  const now = Date.now()
  // Newest first, as `get_service_history` returns it. Home Server never
  // recovers: it isn't in MOCK_REACHABLE_HOSTS, so it always probes Down and the
  // timeline has to agree.
  return [
    { type: 'transition', host: 'homeserver.local', name: 'Home Server', status: 'down', ts: now - 5 * HOUR_MS },
    { type: 'connection', status: 'restored', ts: now - 26 * HOUR_MS },
    { type: 'connection', status: 'lost', ts: now - 27 * HOUR_MS },
    { type: 'transition', host: 'netflix.com', name: 'Netflix', status: 'up', ts: now - 47 * HOUR_MS },
    { type: 'transition', host: 'netflix.com', name: 'Netflix', status: 'down', ts: now - 48 * HOUR_MS },
    { type: 'running', count: 6, total: mockServices.length, ts: now - 50 * HOUR_MS },
  ]
})()

// A latency character per built-in host: the probe's DNS + TCP + TLS time
// (about three round trips, see crates/rove-core/src/services.rs) from San
// Francisco on the connection above, so it scales with each host's distance.
// Zoom's site is the farthest and noisiest, and now and then drifts past
// GOOD_LATENCY_MAX_MS (120) into the warn band. `spread` is how far a poll can
// wander.
const MOCK_LATENCY_PROFILES: Record<string, { base: number; spread: number }> = {
  'cloudflare.com': { base: 38, spread: 8 }, // anycast edge in the Bay Area
  'google.com': { base: 52, spread: 10 },
  'youtube.com': { base: 61, spread: 14 },
  'netflix.com': { base: 84, spread: 18 },
  'zoom.us': { base: 108, spread: 34 },
}

const FALLBACK_PROFILE = { base: 60, spread: 20 }

function latencyProfile(host: string): { base: number; spread: number } {
  return MOCK_LATENCY_PROFILES[host] ?? FALLBACK_PROFILE
}

// Where each host's walk currently sits, so successive polls continue the line
// rather than teleporting.
const mockLatencyWalk = new Map<string, number>()

/**
 * The next latency for a host: a mean-reverting step from its last value rather
 * than fresh noise around the baseline, so the sparkline drifts, spikes and
 * settles like a real signal instead of a jagged fuzz. The pull back toward the
 * baseline keeps a long run from wandering into another band.
 */
function stepLatency(host: string): number {
  const { base, spread } = latencyProfile(host)
  const prev = mockLatencyWalk.get(host) ?? base
  const pull = (base - prev) * 0.3
  const step = (Math.random() - 0.5) * spread
  const next = Math.max(1, prev + pull + step)
  mockLatencyWalk.set(host, next)
  return next
}

function mockLatencyFor(host: string): number {
  return Math.round(stepLatency(host) * 10) / 10
}

// With no network to probe, the mock only vouches for the public services it
// ships with. Anything else (the seeded self-hosted box, any host the user
// adds) reads as Down rather than pretending an arbitrary name answered. The
// services list and the "test before add" dialog both consult this, so they
// always agree.
const MOCK_REACHABLE_HOSTS = new Set(['google.com', 'cloudflare.com', 'youtube.com', 'netflix.com', 'zoom.us'])

function isMockReachable(host: string): boolean {
  return MOCK_REACHABLE_HOSTS.has(host.trim().toLowerCase())
}

// SERVICE_POLL_INTERVAL_MS in useServiceReachability, so seeded samples are
// spaced like the live ones that continue the line.
const MOCK_POLL_INTERVAL_MS = 15_000

// One brief outage in the seeded window, a few polls back, so the sparkline's gap
// and baseline tick are visible during design work without a row being down.
const MOCK_SEEDED_BLIP: Record<string, number> = { 'youtube.com': 5 }

/**
 * A full window of backdated latency history per reachable host, so the Services
 * sparklines open populated instead of drawing their first lone sample. Each walk
 * ends where live polling picks it up, leaving no seam at the right edge.
 */
function mockSeededLatencyHistory(): Record<string, LatencySample[]> {
  const now = Date.now()
  const history: Record<string, LatencySample[]> = {}
  for (const service of mockServices) {
    if (!isMockReachable(service.host)) continue
    const blipAgo = MOCK_SEEDED_BLIP[service.host]
    history[service.host] = Array.from({ length: MAX_SAMPLES }, (_, i) => {
      const ago = MAX_SAMPLES - 1 - i
      const ms = ago === blipAgo ? null : mockLatencyFor(service.host)
      return { ts: now - ago * MOCK_POLL_INTERVAL_MS, ms }
    })
  }
  return history
}

function mockServiceReachability(): ServicesReport['services'] {
  return mockServices.map((s) =>
    isMockReachable(s.host)
      ? { ...s, latencyMs: mockLatencyFor(s.host), httpStatus: 200 }
      : { ...s, latencyMs: null, httpStatus: null },
  )
}

const MOCK_DIAGNOSTICS: NetworkDiagnostics = {
  gateway: MOCK_GATEWAY,
  defaultInterface: 'en0',
  dnsServers: [MOCK_GATEWAY, '1.1.1.1', '8.8.8.8'],
  // Over the same contended 5 GHz channel as the speed test's jitter.
  gatewayPing: { avgMs: 3.8, jitterMs: 2.9, packetLoss: 0 },
  internet: 'online',
  gatewayVendor: 'Ubiquiti',
  gatewayModel: 'UniFi Dream Router',
  gatewayName: 'UniFi Dream Router',
  isp: {
    name: 'Comcast',
    asn: 'AS7922',
    domain: 'xfinity.com',
    city: 'San Francisco',
    region: 'California',
    country: 'United States',
    publicIp: '203.0.113.57',
    isVpn: false,
  },
}

// Comcast's 200 Mbps cable tier over a busy apartment-block 5 GHz channel. The
// upload is the tier's 5 Mbps, which falls short of live streaming's 6, and the
// contended channel's jitter goes past cloud gaming's 10 ms (see
// `rateCapability`), so those two read Fair and the rest Excellent. The ping
// is to 1.1.1.1, so it sits near the Cloudflare service's round trip.
const MOCK_SPEED_RESULT: SpeedResult = {
  downloadMbps: 186.4,
  uploadMbps: 5.4,
  latencyMs: 16,
  jitterMs: 11.2,
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
  const points: (SpeedResult & { agoHours: number })[] = [
    { downloadMbps: 181.9, uploadMbps: 5.3, latencyMs: 17, jitterMs: 12.1, packetLoss: 0, agoHours: 6 },
    { downloadMbps: 174.6, uploadMbps: 5.1, latencyMs: 19, jitterMs: 13.6, packetLoss: 0, agoHours: 27 },
    { downloadMbps: 192.3, uploadMbps: 5.5, latencyMs: 15, jitterMs: 8.4, packetLoss: 0, agoHours: 52 },
    { downloadMbps: 158.2, uploadMbps: 4.9, latencyMs: 22, jitterMs: 16.8, packetLoss: 0, agoHours: 74 },
    { downloadMbps: 188.7, uploadMbps: 5.4, latencyMs: 16, jitterMs: 10.6, packetLoss: 0, agoHours: 121 },
    { downloadMbps: 179.4, uploadMbps: 5.2, latencyMs: 17, jitterMs: 11.9, packetLoss: 0, agoHours: 168 },
    { downloadMbps: 166.8, uploadMbps: 5.0, latencyMs: 20, jitterMs: 14.3, packetLoss: 1, agoHours: 240 },
    { downloadMbps: 194.5, uploadMbps: 5.5, latencyMs: 14, jitterMs: 7.9, packetLoss: 0, agoHours: 312 },
  ]
  return points.map(({ agoHours, ...speed }) => ({
    ...speed,
    ...MOCK_SPEED_CONTEXT,
    timestamp: Date.now() - agoHours * HOUR_MS,
  }))
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** `base` nudged by up to ±spread/2, rounded to one decimal. */
function wobble(base: number, spread: number): number {
  return Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10
}

// How far back the usage views claim tracking started.
const MOCK_TRACKING_SINCE_AGO_MS = 42 * MINUTE_MS
// Mirrors SPEED_HISTORY_LIMIT in crates/rove-core/src/store/speed.rs.
const MOCK_SPEED_HISTORY_LIMIT = 50

/** Smoothstep easing over 0..1, for ramps that start and land softly. */
function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

function createMockNetworkApi(): NetworkAPI {
  const progressListeners = new Set<(p: SpeedTestProgress) => void>()
  let isCancelled = false

  // One 1 Hz sampler feeds live throughput (the Traffic card). A speed test
  // saturates the link, so during one the live reading is the test's rate:
  // `testTraffic` holds it and the sampler emits it, which is what makes the
  // Speed view's Download and Upload numbers climb (useSpeedTest keeps their
  // running peak). When null, the sampler plays an idle pattern with bursts.
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
    const isStreaming = Math.floor(idleTick / 6) % 4 === 0
    const shouldNudge = Math.floor(idleTick / 3) % 5 === 0
    if (isStreaming) {
      return { down: 22 + Math.random() * 46, up: 0.8 + Math.random() * 3.2 }
    }
    if (shouldNudge) {
      return { down: 1.5 + Math.random() * 6, up: 0.2 + Math.random() * 1.1 }
    }
    return { down: 0.02 + Math.random() * 0.06, up: 0.01 + Math.random() * 0.03 }
  }

  const startLive = (): void => {
    if (liveTimer) return
    liveTimer = setInterval(() => {
      if (testTraffic) {
        // Light ±3% jitter so the driven line reads as live, not flat.
        const jitter = 0.97 + Math.random() * 0.06
        emitLive(testTraffic.downloadMbps * jitter, testTraffic.uploadMbps * jitter)
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

  // In memory: seeded, and reset on reload.
  let mockHistory: SpeedHistoryEntry[] = seedSpeedHistory()
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
    // ScanStatus beside the subnet only shows while a scan with results is in
    // flight, and each of its three stages holds SCAN_PHASE_MS (1.3s). So the
    // first scan resolves fast for a snappy first paint, while a rescan runs
    // long enough to walk all three, which is what shows the indicator in the
    // site demo.
    getDevices: (() => {
      let scanCount = 0
      return async () => {
        scanCount += 1
        await delay(scanCount === 1 ? 700 : 3600)
        return { ...MOCK_DEVICE_SCAN, scannedAt: Date.now() }
      }
    })(),
    onNetworkChanged: () => () => undefined,
    getInternetStatus: async () => 'online',
    onInternetStatus: () => () => undefined,
    getNetworkEvents: async () => {
      await delay(200)
      return mockEvents
    },
    getDataUsage: async () => {
      await delay(200)
      // A believable week: lighter midweek, heavier at the weekend, today still
      // filling in. Index 0 is six days ago, index 6 today. [downGB, upGB].
      const byDay: [number, number][] = [
        [5.1, 0.7],
        [3.4, 0.5],
        [6.2, 0.9],
        [8.7, 1.2],
        [11.8, 1.9],
        [16.4, 2.3],
        [4.9, 0.6],
      ]
      const days = byDay.map(([down, up], i) => {
        const when = new Date(Date.now() - (6 - i) * DAY_MS)
        const key = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
        return {
          date: key,
          rxBytes: Math.round(down * GB),
          txBytes: Math.round(up * GB),
        }
      })
      return {
        days,
        bootRxBytes: 23_400_000_000,
        bootTxBytes: 3_100_000_000,
        trackingSince: Date.now() - 6 * DAY_MS,
      }
    },
    getAppUsage: async (): Promise<AppUsageSummary> => {
      await delay(200)
      const apps = MOCK_APP_ROWS.map(([name, down, up]) => ({
        name,
        rxBytes: Math.round(down * MB),
        txBytes: Math.round(up * MB),
        // The mock has no real OS icons; rows fall back to favicon/monogram.
        icon: null,
      }))
      return { apps, support: 'supported', trackingSince: Date.now() - MOCK_TRACKING_SINCE_AGO_MS }
    },
    getHostUsage: async (): Promise<HostUsageSummary> => {
      await delay(200)
      // Every app in MOCK_APP_ROWS gets hosts, in order, so an Apps row's link
      // never lands on a missing group. [host, ip, countryCode, downMB, upMB]; a null country code
      // (LAN peer) shows no flag, a null host the bare IP. Per-app sums stay
      // within getAppUsage's totals: hosts count only TCP traffic.
      const apps: [string, [string | null, string, string | null, number, number][]][] = [
        [
          'firefox',
          [
            ['a23-212-6-37.deploy.static.akamaitechnologies.com', '23.212.6.37', 'US', 342, 27],
            ['edge-star.facebook.com', '157.240.22.35', 'US', 268, 20],
            ['gru.cdn.instagram.com', '31.13.85.52', 'IE', 178, 8],
            ['duckduckgo.com', '52.142.124.215', 'US', 38, 5],
            [null, '203.0.113.9', 'JP', 15, 2],
          ],
        ],
        [
          'Spotify',
          [
            ['audio-fa.scdn.co', '35.186.224.25', 'US', 190, 4],
            ['gew1-accesspoint.ap.spotify.com', '104.199.65.9', 'DE', 24, 4],
          ],
        ],
        [
          'com.apple.WebKit.Networking',
          [
            ['p52-content.icloud.com', '17.248.184.72', 'US', 74, 4],
            ['gateway.icloud.com', '17.248.130.11', 'US', 28, 5],
            ['guzzoni.apple.com', '17.252.76.19', 'US', 10, 1],
          ],
        ],
        ['Dropbox', [['edge-block-api.dropbox.com', '162.125.248.18', 'US', 41, 88]]],
        [
          'slack',
          [
            ['wss-primary.slack.com', '99.86.229.44', 'US', 27, 8],
            [null, '192.168.1.14', null, 12, 4],
          ],
        ],
        [
          'softwareupdated',
          [
            ['swcdn.apple.com', '17.253.17.201', 'US', 27, 0.4],
            ['swscan.apple.com', '17.253.17.207', 'US', 3, 0.5],
          ],
        ],
        // Upload-heavy, the shape an ssh session actually has: a LAN box and a
        // remote build host.
        [
          'ssh',
          [
            ['build-01.example.net', '198.51.100.24', 'DE', 2.5, 17],
            [null, '192.168.1.20', null, 1.2, 9],
          ],
        ],
      ]
      return {
        apps: apps.map(([name, hosts]) => {
          const mapped = hosts.map(([host, ip, countryCode, down, up]) => ({
            ip: ip ?? host ?? '',
            host,
            countryCode,
            rxBytes: Math.round(down * MB),
            txBytes: Math.round(up * MB),
          }))
          return {
            name,
            icon: null,
            rxBytes: mapped.reduce((s, h) => s + h.rxBytes, 0),
            txBytes: mapped.reduce((s, h) => s + h.txBytes, 0),
            hosts: mapped,
          }
        }),
        support: 'supported',
        trackingSince: Date.now() - MOCK_TRACKING_SINCE_AGO_MS,
      }
    },
    // The mock's per-app usage is always supported, so there's no reason to
    // give and no shell to elevate through.
    getUsageSupportDetail: async () => null,
    relaunchAsAdmin: async () => {
      throw new Error('Relaunching as administrator needs the desktop app.')
    },
    getTrafficUsage: async (): Promise<TrafficUsageSummary> => {
      await delay(200)
      // A believable protocol mix for the session above: the web dominates,
      // then a QUIC/HTTP3 slice, DNS, push keepalives, an ssh session's upload,
      // and a long tail of unrecognised ports. [id, label, downMB, upMB].
      const rows: [string, string, number, number][] = [
        ['https', 'HTTPS', 1180, 132],
        ['fileshare', 'File sharing', 96, 14],
        ['media', 'Streaming media', 88, 3],
        ['vpn', 'VPN', 44, 51],
        ['ssh', 'SSH', 4, 27],
        ['database', 'Database', 12, 9],
        ['dns', 'DNS', 6, 7],
        ['push', 'Push', 3, 4],
        ['email', 'Email', 2, 1],
        ['ntp', 'NTP', 0.1, 0.1],
        ['other', 'Other', 18, 6],
      ]
      const types = rows
        .map(([id, label, down, up]) => ({
          id,
          label,
          rxBytes: Math.round(down * MB),
          txBytes: Math.round(up * MB),
        }))
        .sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes))
      return { types, support: 'supported', trackingSince: Date.now() - MOCK_TRACKING_SINCE_AGO_MS }
    },
    runDiagnostics: async () => {
      await delay(700)
      return MOCK_DIAGNOSTICS
    },
    // Wobble the live numbers around their baselines each poll so the count-up
    // animation is visibly exercised in the browser mock.
    runDiagnosticsLive: async (): Promise<LiveDiagnostics> => {
      await delay(300)
      const basePing = MOCK_DIAGNOSTICS.gatewayPing
      return {
        gatewayPing: basePing
          ? {
              avgMs: Math.max(0.1, wobble(basePing.avgMs, 3)),
              jitterMs: Math.max(0, wobble(basePing.jitterMs, 1)),
              packetLoss: basePing.packetLoss,
            }
          : null,
        internet: 'online',
      }
    },
    // The Services view's own probe, wobbled per poll like the live metrics above.
    runServices: async (): Promise<ServicesReport> => {
      await delay(300)
      return {
        internet: 'online',
        services: mockServiceReachability().map((service) => ({
          ...service,
          latencyMs: service.latencyMs == null ? null : Math.max(1, wobble(service.latencyMs, 12)),
        })),
      }
    },
    testService: async (host: string) => {
      // The same verdict as the services list, so a host that shows Down there
      // also fails the test-before-add check.
      await delay(650)
      return isMockReachable(host) ? mockLatencyFor(host) : null
    },
    listServices: async () => {
      await delay(120)
      return mockServices.map((s) => ({ ...s }))
    },
    addService: async (name: string, host: string) => {
      await delay(160)
      upsertMockService(name, host)
      return mockServices.map((s) => ({ ...s }))
    },
    updateService: async (oldHost: string, name: string, host: string) => {
      await delay(160)
      const at = mockServices.findIndex((s) => s.host === oldHost)
      const isHostTaken = host !== oldHost && mockServices.some((s) => s.host === host)
      if (at >= 0 && !isHostTaken) {
        mockServices[at] = { name, host }
      } else {
        // Like the store: fold into the row that already has the host, or append.
        if (at >= 0) mockServices.splice(at, 1)
        upsertMockService(name, host)
      }
      return mockServices.map((s) => ({ ...s }))
    },
    deleteService: async (host: string) => {
      await delay(160)
      const at = mockServices.findIndex((s) => s.host === host)
      if (at >= 0) mockServices.splice(at, 1)
      return mockServices.map((s) => ({ ...s }))
    },
    getServiceHistory: async () => {
      await delay(140)
      return mockServiceHistory.map((e) => ({ ...e }))
    },
    clearServiceHistory: async () => {
      await delay(120)
      mockServiceHistory.length = 0
    },
    // No heartbeat in the mock, so the timeline never nudges; it renders what
    // `getServiceHistory` returned on mount.
    onServicesTimeline: () => () => undefined,
    runSpeedTest: async (): Promise<SpeedTestResult> => {
      isCancelled = false
      const { downloadMbps: resultDownloadMbps, uploadMbps: resultUploadMbps } = MOCK_SPEED_RESULT

      // A realistic ~10 s test, stepped every 200 ms. Each phase's band starts on
      // one of the backend's progress steps (PROGRESS_STEPS in progress-fill.ts),
      // which the UI uses to reveal the Download and Upload cells.
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
          if (isCancelled) {
            testTraffic = null
            throw new Error('SPEED_TEST_CANCELLED')
          }
          const phaseProgress = i / ticks // 0..1

          if (phase.name === 'download') {
            // Quick rise, then hold near the achieved rate with a little wobble.
            const ramp = smoothstep(phaseProgress * 1.5)
            testTraffic = {
              downloadMbps: resultDownloadMbps * ramp * (0.98 + Math.random() * 0.04),
              uploadMbps: 0.05 + Math.random() * 0.1,
            }
          } else if (phase.name === 'upload') {
            const ramp = smoothstep(phaseProgress * 1.5)
            testTraffic = {
              downloadMbps: resultDownloadMbps * 0.03 * (1 - phaseProgress), // download tapers as upload takes over
              uploadMbps: resultUploadMbps * ramp * (0.98 + Math.random() * 0.04),
            }
          } else {
            // Latency and finish: the link is mostly quiet.
            testTraffic = {
              downloadMbps: 0.05 + Math.random() * 0.12,
              uploadMbps: 0.03 + Math.random() * 0.06,
            }
          }

          emitProgress({
            phase: 'internet',
            message: phase.message,
            progress: phase.from + (phase.to - phase.from) * phaseProgress,
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
      isCancelled = true
      testTraffic = null
    },
    getSpeedHistory: async () => mockHistory,
    saveSpeedResult: async (entry: SpeedHistoryEntry) => {
      mockHistory = [entry, ...mockHistory].slice(0, MOCK_SPEED_HISTORY_LIMIT)
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
 * Installs the mock bridge when there's no real one (a plain browser); a no-op
 * once `window.networkAPI` exists. Returns whether it installed.
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
  seedLatencyHistory(mockSeededLatencyHistory())

  console.info('[rove] Tauri bridge not found, using in-browser mock network data (dev only).')
  return true
}
