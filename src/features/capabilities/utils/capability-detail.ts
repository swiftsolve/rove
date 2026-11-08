import type { CapabilityId, CapabilityLevel, CapabilityRequirement, SpeedResult } from '@/types'
import { CAPABILITY_DEFINITIONS, isMeasuredLatency } from '@/types'
import { formatLatencyMs, formatSpeedMbps } from '@/utils/format'

export type RequirementCheck = {
  label: string
  /** The limit as shown: "≥ 25 Mbps". */
  need: string
  /** The limit as a screen reader says it, with no symbol: "at least 25 Mbps". */
  spokenNeed: string
  /** The measured figure, or null when it isn't a real one (a failed ping). */
  have: string | null
  isMet: boolean
  /** A minimum (a speed) falls short by being too low; a maximum (a delay or loss) by being too high. */
  kind: 'minimum' | 'maximum'
}

export type CapabilityExplanation = {
  summary: string
  checks: RequirementCheck[]
}

const DEFINITIONS_BY_ID = new Map(CAPABILITY_DEFINITIONS.map((definition) => [definition.id, definition]))

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

function capitalizedListPhrase(words: string[]): string {
  const phrase = listPhrase(words)
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

/** What falls short, each kind in its own words: "download too slow and latency too high". */
function shortfallPhrase(
  failing: RequirementCheck[],
  shortfallWordsByKind: { minimum: string; maximum: string },
): string {
  const phrases: string[] = []
  for (const kind of ['minimum', 'maximum'] as const) {
    const labels = failing.filter((check) => check.kind === kind).map((check) => check.label.toLowerCase())
    if (labels.length > 0) phrases.push(`${listPhrase(labels)} ${shortfallWordsByKind[kind]}`)
  }
  return capitalizedListPhrase(phrases)
}

function summarize(level: CapabilityLevel, label: string, failing: RequirementCheck[]): string {
  const activity = activityPhrase(label)

  switch (level) {
    case 'excellent':
      return `Well above what ${activity} needs.`
    case 'good':
      return `Meets ${activity} requirements.`
    case 'fair':
      return failing.length > 0
        ? `${shortfallPhrase(failing, { minimum: 'below recommended', maximum: 'above recommended' })}.`
        : `Works, but with little headroom.`
    case 'poor':
      return failing.length > 0
        ? `${shortfallPhrase(failing, { minimum: 'too slow', maximum: 'too high' })} for ${activity}.`
        : `Below what ${activity} needs.`
    case 'unsupported':
      return `Not enough for ${activity}.`
  }
}

export function explainCapability(id: CapabilityId, level: CapabilityLevel, speed: SpeedResult): CapabilityExplanation {
  const definition = DEFINITIONS_BY_ID.get(id)
  if (!definition) return { summary: '', checks: [] }

  const requirements: CapabilityRequirement = definition.requirements
  const checks: RequirementCheck[] = []
  // A limit left out doesn't affect this capability, so it gets no row.
  if (requirements.minDownloadMbps !== null) {
    checks.push({
      label: 'Download',
      need: `≥ ${formatSpeedMbps(requirements.minDownloadMbps) ?? ''}`,
      spokenNeed: `at least ${formatSpeedMbps(requirements.minDownloadMbps) ?? ''}`,
      have: formatSpeedMbps(speed.downloadMbps),
      isMet: speed.downloadMbps >= requirements.minDownloadMbps,
      kind: 'minimum',
    })
  }
  if (requirements.minUploadMbps !== null) {
    checks.push({
      label: 'Upload',
      need: `≥ ${formatSpeedMbps(requirements.minUploadMbps) ?? ''}`,
      spokenNeed: `at least ${formatSpeedMbps(requirements.minUploadMbps) ?? ''}`,
      have: formatSpeedMbps(speed.uploadMbps),
      isMet: speed.uploadMbps >= requirements.minUploadMbps,
      kind: 'minimum',
    })
  }
  // A failed ping reports a sentinel, not a delay, so none of its figures is shown.
  const hasPing = isMeasuredLatency(speed.latencyMs)
  if (requirements.maxLatencyMs !== null) {
    checks.push({
      label: 'Latency',
      need: `≤ ${requirements.maxLatencyMs} ms`,
      spokenNeed: `${requirements.maxLatencyMs} ms or less`,
      have: hasPing ? formatLatencyMs(speed.latencyMs) : null,
      isMet: hasPing && speed.latencyMs <= requirements.maxLatencyMs,
      kind: 'maximum',
    })
  }
  if (requirements.maxJitterMs !== null) {
    checks.push({
      label: 'Jitter',
      need: `≤ ${requirements.maxJitterMs} ms`,
      spokenNeed: `${requirements.maxJitterMs} ms or less`,
      have: hasPing ? formatLatencyMs(speed.jitterMs) : null,
      isMet: hasPing && speed.jitterMs <= requirements.maxJitterMs,
      kind: 'maximum',
    })
  }
  if (requirements.maxPacketLossPercent !== null) {
    checks.push({
      label: 'Loss',
      need: `≤ ${requirements.maxPacketLossPercent}%`,
      spokenNeed: `${requirements.maxPacketLossPercent}% or less`,
      have: hasPing ? `${speed.packetLoss}%` : null,
      isMet: hasPing && speed.packetLoss <= requirements.maxPacketLossPercent,
      kind: 'maximum',
    })
  }

  const failing = checks.filter((check) => !check.isMet)

  return { summary: summarize(level, definition.label, failing), checks }
}
