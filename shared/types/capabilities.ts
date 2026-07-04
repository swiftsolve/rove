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
  readonly minDownloadMbps: number
  readonly minUploadMbps: number
  readonly maxLatencyMs: number
  readonly maxJitterMs: number
}

export const CAPABILITY_DEFINITIONS = [
  {
    id: 'browsing',
    label: 'Web Browsing',
    description: 'General web, email, social media',
    icon: '🌐',
    requirements: { minDownloadMbps: 5, minUploadMbps: 1, maxLatencyMs: 100, maxJitterMs: 30 },
  },
  {
    id: 'streaming-hd',
    label: 'HD Streaming',
    description: '1080p video streaming',
    icon: '📺',
    requirements: { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 100, maxJitterMs: 30 },
  },
  {
    id: 'streaming-4k',
    label: '4K Streaming',
    description: 'Ultra HD video streaming',
    icon: '🎬',
    requirements: { minDownloadMbps: 25, minUploadMbps: 5, maxLatencyMs: 80, maxJitterMs: 20 },
  },
  {
    id: 'video-calls',
    label: 'Video Calls',
    description: 'Zoom, Teams, Google Meet',
    icon: '📹',
    requirements: { minDownloadMbps: 8, minUploadMbps: 3, maxLatencyMs: 150, maxJitterMs: 40 },
  },
  {
    id: 'gaming',
    label: 'Online Gaming',
    description: 'Low-latency multiplayer games',
    icon: '🎮',
    requirements: { minDownloadMbps: 15, minUploadMbps: 5, maxLatencyMs: 50, maxJitterMs: 15 },
  },
  {
    id: 'cloud-gaming',
    label: 'Cloud Gaming',
    description: 'GeForce NOW, Xbox Cloud',
    icon: '☁️',
    requirements: { minDownloadMbps: 35, minUploadMbps: 10, maxLatencyMs: 40, maxJitterMs: 10 },
  },
  {
    id: 'large-downloads',
    label: 'Large Downloads',
    description: 'Game updates, file transfers',
    icon: '⬇️',
    requirements: { minDownloadMbps: 50, minUploadMbps: 10, maxLatencyMs: 200, maxJitterMs: 50 },
  },
  {
    id: 'live-streaming',
    label: 'Live Streaming',
    description: 'Twitch, YouTube live broadcasting',
    icon: '📡',
    requirements: { minDownloadMbps: 10, minUploadMbps: 10, maxLatencyMs: 100, maxJitterMs: 30 },
  },
] as const

export type CapabilityId = (typeof CAPABILITY_DEFINITIONS)[number]['id']

export interface CapabilityDefinition {
  readonly id: CapabilityId
  readonly label: string
  readonly description: string
  readonly icon: string
  readonly requirements: CapabilityRequirement
}

export interface CapabilityRating {
  readonly id: CapabilityId
  readonly label: string
  readonly description: string
  readonly icon: string
  readonly level: CapabilityLevel
}

export interface SpeedTestResult {
  readonly internet: SpeedResult
  readonly capabilities: readonly CapabilityRating[]
  readonly linkCapacityMbps: number | null
}

export const CAPABILITY_LEVEL_LABELS: Readonly<Record<CapabilityLevel, string>> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unsupported: 'Unsupported',
}
