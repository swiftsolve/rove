import type { CapabilityId, CapabilityLevel, CapabilityRequirement, SpeedResult } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { formatLatencyMs, formatSpeedMbps } from '@/lib/format'

export interface RequirementCheck {
  label: string
  need: string
  have: string
  isMet: boolean
}

export interface CapabilityExplanation {
  summary: string
  checks: RequirementCheck[]
}

const DEFINITIONS = new Map(CAPABILITY_DEFINITIONS.map((definition) => [definition.id, definition]))

function listPhrase(words: string[]): string {
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

function metricPhrase(words: string[]): string {
  const phrase = listPhrase(words)
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

function summarize(level: CapabilityLevel, label: string, failing: string[]): string {
  const activity = activityPhrase(label)

  switch (level) {
    case 'excellent':
      return `Well above what ${activity} needs.`
    case 'good':
      return `Meets ${activity} requirements.`
    case 'fair':
      return failing.length > 0
        ? `${metricPhrase(failing)} below recommended.`
        : `Works, but with little headroom.`
    case 'poor':
      return failing.length > 0
        ? `${metricPhrase(failing)} too low for ${activity}.`
        : `Below what ${activity} needs.`
    case 'unsupported':
      return `Not enough for ${activity}.`
  }
}

export function explainCapability(
  id: CapabilityId,
  level: CapabilityLevel,
  speed: SpeedResult,
): CapabilityExplanation {
  const definition = DEFINITIONS.get(id)
  if (!definition) return { summary: '', checks: [] }

  const requirements: CapabilityRequirement = definition.requirements
  const checks: RequirementCheck[] = [
    {
      label: 'Download',
      need: `≥ ${formatSpeedMbps(requirements.minDownloadMbps)}`,
      have: formatSpeedMbps(speed.downloadMbps),
      isMet: speed.downloadMbps >= requirements.minDownloadMbps,
    },
    {
      label: 'Upload',
      need: `≥ ${formatSpeedMbps(requirements.minUploadMbps)}`,
      have: formatSpeedMbps(speed.uploadMbps),
      isMet: speed.uploadMbps >= requirements.minUploadMbps,
    },
  ]
  // A limit left out doesn't affect this capability, so it gets no row.
  if (requirements.maxLatencyMs !== null) {
    checks.push({
      label: 'Latency',
      need: `≤ ${requirements.maxLatencyMs} ms`,
      have: formatLatencyMs(speed.latencyMs),
      isMet: speed.latencyMs <= requirements.maxLatencyMs,
    })
  }
  if (requirements.maxJitterMs !== null) {
    checks.push({
      label: 'Jitter',
      need: `≤ ${requirements.maxJitterMs} ms`,
      have: formatLatencyMs(speed.jitterMs),
      isMet: speed.jitterMs <= requirements.maxJitterMs,
    })
  }

  const failing = checks.filter((check) => !check.isMet).map((check) => check.label.toLowerCase())

  return { summary: summarize(level, definition.label, failing), checks }
}
