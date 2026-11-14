import type { SpeedResult } from './speed'

export type CapabilityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unsupported'

export type CapabilityRequirement = {
  /** Null when download speed doesn't affect it, and the same for each limit below. */
  minDownloadMbps: number | null
  minUploadMbps: number | null
  maxLatencyMs: number | null
  maxJitterMs: number | null
  /** Packet loss, in percent. */
  maxPacketLossPercent: number | null
  /**
   * False when a slow connection only makes it slow, so it bottoms out at
   * 'poor' instead of 'unsupported'. True when left out.
   */
  canBeUnsupported?: boolean
}

/** A measure a capability can set a limit on: where its limit and its reading live. */
export type CapabilityMeasure = {
  label: string
  limitKey: Exclude<keyof CapabilityRequirement, 'canBeUnsupported'>
  readingKey: keyof SpeedResult
  /** A minimum (a speed) falls short by being too low; a maximum (a delay or loss) by being too high. */
  kind: 'minimum' | 'maximum'
  unit: 'Mbps' | 'ms' | '%'
  /** Read from the test's pings, which report a sentinel instead when they fail. */
  isFromPing: boolean
}

/** Every measure a requirement can limit, in the order the details card shows them. */
export const CAPABILITY_MEASURES: readonly CapabilityMeasure[] = [
  {
    label: 'Download',
    limitKey: 'minDownloadMbps',
    readingKey: 'downloadMbps',
    kind: 'minimum',
    unit: 'Mbps',
    isFromPing: false,
  },
  {
    label: 'Upload',
    limitKey: 'minUploadMbps',
    readingKey: 'uploadMbps',
    kind: 'minimum',
    unit: 'Mbps',
    isFromPing: false,
  },
  {
    label: 'Latency',
    limitKey: 'maxLatencyMs',
    readingKey: 'latencyMs',
    kind: 'maximum',
    unit: 'ms',
    isFromPing: true,
  },
  { label: 'Jitter', limitKey: 'maxJitterMs', readingKey: 'jitterMs', kind: 'maximum', unit: 'ms', isFromPing: true },
  {
    label: 'Loss',
    limitKey: 'maxPacketLossPercent',
    readingKey: 'packetLoss',
    kind: 'maximum',
    unit: '%',
    isFromPing: true,
  },
]

/**
 * Each limit comes from the provider or guide named beside it; the rest are
 * Rove's own rules of thumb, marked so. Buffered video and browsing set no
 * latency or jitter limit: a buffer absorbs delay, and no provider names one.
 * Keep in step with CAPABILITY_DEFS in crates/rove-core/src/capabilities.rs.
 */
export const CAPABILITY_DEFINITIONS = [
  {
    id: 'browsing',
    label: 'Web browsing',
    description: 'General web, email, social media',
    icon: '🌐',
    // Down: FCC broadband speed guide, browsing, email and social media (1 Mbps).
    requirements: {
      minDownloadMbps: 1,
      minUploadMbps: null,
      maxLatencyMs: null,
      maxJitterMs: null,
      maxPacketLossPercent: null,
    },
  },
  {
    id: 'streaming-hd',
    label: 'HD streaming',
    description: '1080p video streaming',
    icon: '📺',
    // Down: Netflix and YouTube, 1080p (5 Mbps).
    requirements: {
      minDownloadMbps: 5,
      minUploadMbps: null,
      maxLatencyMs: null,
      maxJitterMs: null,
      maxPacketLossPercent: null,
    },
  },
  {
    id: 'streaming-4k',
    label: '4K streaming',
    description: 'Ultra HD video streaming',
    icon: '🎬',
    // Down: YouTube, 4K (20 Mbps); Netflix asks for 15.
    requirements: {
      minDownloadMbps: 20,
      minUploadMbps: null,
      maxLatencyMs: null,
      maxJitterMs: null,
      maxPacketLossPercent: null,
    },
  },
  {
    id: 'video-calls',
    label: 'Video calls',
    description: 'Zoom, Teams, Google Meet',
    icon: '📹',
    // Down and up: Zoom, 1080p group call (3.0 down, 3.8 up). Latency, jitter
    // and loss: Microsoft Teams, client to Microsoft's edge.
    requirements: {
      minDownloadMbps: 3,
      minUploadMbps: 3.8,
      maxLatencyMs: 100,
      maxJitterMs: 30,
      maxPacketLossPercent: 1,
    },
  },
  {
    id: 'live-streaming',
    label: 'Live streaming',
    description: 'Twitch, YouTube live broadcasting',
    icon: '📡',
    // Up: Twitch's 1080p60 bitrate (6,000 kbps), kept under 75% of the
    // upload so the stream has headroom (a rule of thumb).
    requirements: {
      minDownloadMbps: null,
      minUploadMbps: 8,
      maxLatencyMs: null,
      maxJitterMs: null,
      maxPacketLossPercent: null,
    },
  },
  {
    id: 'gaming',
    label: 'Online gaming',
    description: 'Low-latency multiplayer games',
    icon: '🎮',
    // Down: FCC broadband speed guide, online multiplayer (4 Mbps). No game
    // publishes the rest, so up, latency, jitter and loss are rules of thumb.
    requirements: {
      minDownloadMbps: 4,
      minUploadMbps: 2,
      maxLatencyMs: 50,
      maxJitterMs: 15,
      maxPacketLossPercent: 1,
    },
  },
  {
    id: 'cloud-gaming',
    label: 'Cloud gaming',
    description: 'GeForce NOW, Xbox Cloud',
    icon: '☁️',
    // Down and latency: GeForce NOW, 1080p at 60 fps (25 Mbps), under 40 ms
    // recommended. It requires under 80 ms, where the rating calls it
    // unsupported. Up, jitter and loss are rules of thumb.
    requirements: {
      minDownloadMbps: 25,
      minUploadMbps: 3,
      maxLatencyMs: 40,
      maxJitterMs: 10,
      maxPacketLossPercent: 1,
    },
  },
  {
    id: 'large-downloads',
    label: 'Large downloads',
    description: 'Game updates, file transfers',
    icon: '⬇️',
    // Down: the FCC's broadband benchmark (100 Mbps), a 100 GB game in about
    // two hours. Only download speed sets how long a download takes; the
    // upload just carries its acknowledgements. A slow line still downloads,
    // so never unsupported.
    requirements: {
      minDownloadMbps: 100,
      minUploadMbps: null,
      maxLatencyMs: null,
      maxJitterMs: null,
      maxPacketLossPercent: null,
      canBeUnsupported: false,
    },
  },
] as const

export type CapabilityId = (typeof CAPABILITY_DEFINITIONS)[number]['id']

export type CapabilityDefinition = {
  id: CapabilityId
  label: string
  description: string
  icon: string
  requirements: CapabilityRequirement
}

export type CapabilityRating = {
  id: CapabilityId
  label: string
  description: string
  icon: string
  level: CapabilityLevel
}

export type SpeedTestResult = {
  internet: SpeedResult
  capabilities: CapabilityRating[]
  linkCapacityMbps: number | null
}
