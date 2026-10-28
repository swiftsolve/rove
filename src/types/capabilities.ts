import type { SpeedResult } from './speed'

export const CAPABILITY_LEVELS = [
  'excellent',
  'good',
  'fair',
  'poor',
  'unsupported',
] as const

export type CapabilityLevel = (typeof CAPABILITY_LEVELS)[number]

export interface CapabilityRequirement {
  minDownloadMbps: number
  minUploadMbps: number
  maxLatencyMs: number
  maxJitterMs: number
}

// Each speed comes from the provider or guide named beside it. Providers don't
// publish latency or jitter limits (bar GeForce NOW's latency), and few publish
// upload, so those are Rove's own rules of thumb unless noted. Keep in step with
// DEFS in crates/rove-core/src/capabilities.rs.
export const CAPABILITY_DEFINITIONS = [
  {
    id: 'browsing',
    label: 'Web Browsing',
    description: 'General web, email, social media',
    icon: '🌐',
    // Down: FCC broadband speed guide, browsing, email and social media (1 Mbps).
    requirements: { minDownloadMbps: 1, minUploadMbps: 1, maxLatencyMs: 100, maxJitterMs: 30 },
  },
  {
    id: 'streaming-hd',
    label: 'HD Streaming',
    description: '1080p video streaming',
    icon: '📺',
    // Down: Netflix and YouTube, 1080p (5 Mbps).
    requirements: { minDownloadMbps: 5, minUploadMbps: 1, maxLatencyMs: 100, maxJitterMs: 30 },
  },
  {
    id: 'streaming-4k',
    label: '4K Streaming',
    description: 'Ultra HD video streaming',
    icon: '🎬',
    // Down: YouTube, 4K (20 Mbps); Netflix asks for 15.
    requirements: { minDownloadMbps: 20, minUploadMbps: 2, maxLatencyMs: 80, maxJitterMs: 20 },
  },
  {
    id: 'video-calls',
    label: 'Video Calls',
    description: 'Zoom, Teams, Google Meet',
    icon: '📹',
    // Down and up: Zoom, 1080p group call (3.0 down, 3.8 up).
    requirements: { minDownloadMbps: 3, minUploadMbps: 3.8, maxLatencyMs: 150, maxJitterMs: 30 },
  },
  {
    id: 'live-streaming',
    label: 'Live Streaming',
    description: 'Twitch, YouTube live broadcasting',
    icon: '📡',
    // Up: Twitch's 1080p60 bitrate (6,000 kbps).
    requirements: { minDownloadMbps: 5, minUploadMbps: 6, maxLatencyMs: 100, maxJitterMs: 30 },
  },
  {
    id: 'gaming',
    label: 'Online Gaming',
    description: 'Low-latency multiplayer games',
    icon: '🎮',
    // Down: FCC broadband speed guide, online multiplayer (4 Mbps).
    requirements: { minDownloadMbps: 4, minUploadMbps: 2, maxLatencyMs: 50, maxJitterMs: 15 },
  },
  {
    id: 'cloud-gaming',
    label: 'Cloud Gaming',
    description: 'GeForce NOW, Xbox Cloud',
    icon: '☁️',
    // Down and latency: GeForce NOW, 1080p at 60 fps (25 Mbps), under 40 ms
    // recommended. It requires under 80 ms, where the rating calls it unsupported.
    requirements: { minDownloadMbps: 25, minUploadMbps: 3, maxLatencyMs: 40, maxJitterMs: 10 },
  },
  {
    id: 'large-downloads',
    label: 'Large Downloads',
    description: 'Game updates, file transfers',
    icon: '⬇️',
    // No provider figure: Rove's own, a 10 GB game update in under half an hour.
    requirements: { minDownloadMbps: 50, minUploadMbps: 2, maxLatencyMs: 200, maxJitterMs: 50 },
  },
] as const

export type CapabilityId = (typeof CAPABILITY_DEFINITIONS)[number]['id']

export interface CapabilityDefinition {
  id: CapabilityId
  label: string
  description: string
  icon: string
  requirements: CapabilityRequirement
}

export interface CapabilityRating {
  id: CapabilityId
  label: string
  description: string
  icon: string
  level: CapabilityLevel
}

export interface SpeedTestResult {
  internet: SpeedResult
  capabilities: CapabilityRating[]
  linkCapacityMbps: number | null
}

