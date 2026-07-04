import type { CapabilityId, CapabilityLevel, SpeedResult } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'

export interface RequirementCheck {
  readonly label: string
  readonly need: string
  readonly have: string
  readonly pass: boolean
}

export interface CapabilityExplanation {
  readonly summary: string
  readonly checks: readonly RequirementCheck[]
}

const DEFINITIONS = new Map(CAPABILITY_DEFINITIONS.map((definition) => [definition.id, definition]))

function listPhrase(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  if (words.length === 2) return `${words[0]} and ${words[1]}`
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`
}

/** Lowercase a label for use mid-sentence, preserving acronyms ("HD", "4K"). */
function activityPhrase(label: string): string {
  return label
    .split(' ')
    .map((word) => (/[A-Z]{2}|\d/.test(word) ? word : word.toLowerCase()))
    .join(' ')
}

function summarize(level: CapabilityLevel, label: string, failing: readonly string[]): string {
  const activity = activityPhrase(label)

  switch (level) {
    case 'excellent':
      return `Your connection comfortably exceeds what ${activity} needs.`
    case 'good':
      return `Your connection meets what ${activity} needs.`
    case 'fair':
      return failing.length > 0
        ? `This should work, but your ${listPhrase(failing)} ${failing.length > 1 ? 'are' : 'is'} below the recommended level.`
        : `This should work, though with little headroom.`
    case 'poor':
      return failing.length > 0
        ? `Your ${listPhrase(failing)} ${failing.length > 1 ? 'are' : 'is'} below what ${activity} needs, so it may struggle.`
        : `Your connection falls short of what ${activity} needs.`
    case 'unsupported':
      return `Your connection doesn't have the bandwidth or latency for ${activity}.`
  }
}

export function explainCapability(
  id: CapabilityId,
  level: CapabilityLevel,
  speed: SpeedResult,
): CapabilityExplanation {
  const definition = DEFINITIONS.get(id)
  if (!definition) return { summary: '', checks: [] }

  const { requirements } = definition
  const checks: readonly RequirementCheck[] = [
    {
      label: 'Download',
      need: `≥ ${formatSpeedMbps(requirements.minDownloadMbps)}`,
      have: formatSpeedMbps(speed.downloadMbps),
      pass: speed.downloadMbps >= requirements.minDownloadMbps,
    },
    {
      label: 'Upload',
      need: `≥ ${formatSpeedMbps(requirements.minUploadMbps)}`,
      have: formatSpeedMbps(speed.uploadMbps),
      pass: speed.uploadMbps >= requirements.minUploadMbps,
    },
    {
      label: 'Latency',
      need: `≤ ${requirements.maxLatencyMs} ms`,
      have: formatLatencyMs(speed.latencyMs),
      pass: speed.latencyMs <= requirements.maxLatencyMs,
    },
    {
      label: 'Jitter',
      need: `≤ ${requirements.maxJitterMs} ms`,
      have: formatLatencyMs(speed.jitterMs),
      pass: speed.jitterMs <= requirements.maxJitterMs,
    },
  ]

  const failing = checks.filter((check) => !check.pass).map((check) => check.label.toLowerCase())

  return { summary: summarize(level, definition.label, failing), checks }
}
