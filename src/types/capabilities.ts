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
    requirements: { minDownloadMbps: 5, minUploadMbps: 1, maxLatencyMs: 100, maxJitterMs: 30 },
  },
  {
    id: 'streaming-4k',
    label: '4K Streaming',
    description: 'Ultra HD video streaming',
    icon: '🎬',
    requirements: { minDownloadMbps: 25, minUploadMbps: 2, maxLatencyMs: 80, maxJitterMs: 20 },
  },
  {
    id: 'video-calls',
    label: 'Video Calls',
    description: 'Zoom, Teams, Google Meet',
    icon: '📹',
    requirements: { minDownloadMbps: 5, minUploadMbps: 4, maxLatencyMs: 150, maxJitterMs: 30 },
  },
  {
    id: 'gaming',
    label: 'Online Gaming',
    description: 'Low-latency multiplayer games',
    icon: '🎮',
    requirements: { minDownloadMbps: 5, minUploadMbps: 2, maxLatencyMs: 50, maxJitterMs: 15 },
  },
  {
    id: 'cloud-gaming',
    label: 'Cloud Gaming',
    description: 'GeForce NOW, Xbox Cloud',
    icon: '☁️',
    requirements: { minDownloadMbps: 25, minUploadMbps: 3, maxLatencyMs: 40, maxJitterMs: 10 },
  },
  {
    id: 'large-downloads',
    label: 'Large Downloads',
    description: 'Game updates, file transfers',
    icon: '⬇️',
    requirements: { minDownloadMbps: 50, minUploadMbps: 2, maxLatencyMs: 200, maxJitterMs: 50 },
  },
  {
    id: 'live-streaming',
    label: 'Live Streaming',
    description: 'Twitch, YouTube live broadcasting',
    icon: '📡',
    requirements: { minDownloadMbps: 5, minUploadMbps: 6, maxLatencyMs: 100, maxJitterMs: 30 },
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

