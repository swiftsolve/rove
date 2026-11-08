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
  /** A speed falls short by being too slow; a delay by being too high. */
  kind: 'speed' | 'delay'
}

export type CapabilityExplanation = {
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

function capitalizedListPhrase(words: string[]): string {
  const phrase = listPhrase(words)
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

/** What falls short, each kind in its own words: "download too slow and latency too high". */
function shortfallPhrase(failing: RequirementCheck[], words: { speed: string; delay: string }): string {
  const phrases = (['speed', 'delay'] as const)
    .map((kind) => {
      const labels = failing.filter((check) => check.kind === kind).map((check) => check.label.toLowerCase())
      return labels.length > 0 ? `${listPhrase(labels)} ${words[kind]}` : null
    })
    .filter((phrase) => phrase != null)
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
        ? `${shortfallPhrase(failing, { speed: 'below recommended', delay: 'above recommended' })}.`
        : `Works, but with little headroom.`
    case 'poor':
      return failing.length > 0
        ? `${shortfallPhrase(failing, { speed: 'too slow', delay: 'too high' })} for ${activity}.`
        : `Below what ${activity} needs.`
    case 'unsupported':
      return `Not enough for ${activity}.`
  }
}

export function explainCapability(id: CapabilityId, level: CapabilityLevel, speed: SpeedResult): CapabilityExplanation {
  const definition = DEFINITIONS.get(id)
  if (!definition) return { summary: '', checks: [] }

  const requirements: CapabilityRequirement = definition.requirements
  const checks: RequirementCheck[] = [
    {
      label: 'Download',
      need: `≥ ${formatSpeedMbps(requirements.minDownloadMbps) ?? ''}`,
      spokenNeed: `at least ${formatSpeedMbps(requirements.minDownloadMbps) ?? ''}`,
      have: formatSpeedMbps(speed.downloadMbps),
      isMet: speed.downloadMbps >= requirements.minDownloadMbps,
      kind: 'speed',
    },
    {
      label: 'Upload',
      need: `≥ ${formatSpeedMbps(requirements.minUploadMbps) ?? ''}`,
      spokenNeed: `at least ${formatSpeedMbps(requirements.minUploadMbps) ?? ''}`,
      have: formatSpeedMbps(speed.uploadMbps),
      isMet: speed.uploadMbps >= requirements.minUploadMbps,
      kind: 'speed',
    },
  ]
  // A failed ping reports a sentinel, not a delay, so neither figure is shown.
  const hasPing = isMeasuredLatency(speed.latencyMs)
  // A limit left out doesn't affect this capability, so it gets no row.
  if (requirements.maxLatencyMs !== null) {
    checks.push({
      label: 'Latency',
      need: `≤ ${requirements.maxLatencyMs} ms`,
      spokenNeed: `${requirements.maxLatencyMs} ms or less`,
      have: hasPing ? formatLatencyMs(speed.latencyMs) : null,
      isMet: hasPing && speed.latencyMs <= requirements.maxLatencyMs,
      kind: 'delay',
    })
  }
  if (requirements.maxJitterMs !== null) {
    checks.push({
      label: 'Jitter',
      need: `≤ ${requirements.maxJitterMs} ms`,
      spokenNeed: `${requirements.maxJitterMs} ms or less`,
      have: hasPing ? formatLatencyMs(speed.jitterMs) : null,
      isMet: hasPing && speed.jitterMs <= requirements.maxJitterMs,
      kind: 'delay',
    })
  }

  const failing = checks.filter((check) => !check.isMet)

  return { summary: summarize(level, definition.label, failing), checks }
}
