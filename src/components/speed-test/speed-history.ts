import type { SpeedResult } from '@/types'

export interface SpeedHistoryEntry extends SpeedResult {
  readonly timestamp: number
}

const STORAGE_KEY = 'beacon.speed-history.v1'
const MAX_ENTRIES = 50

function isEntry(value: unknown): value is SpeedHistoryEntry {
  if (typeof value !== 'object' || value == null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.timestamp === 'number' &&
    typeof entry.downloadMbps === 'number' &&
    typeof entry.uploadMbps === 'number'
  )
}

/** Past speed test results, newest first. */
export function loadSpeedHistory(): readonly SpeedHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

export function appendSpeedHistory(result: SpeedResult): void {
  const entry: SpeedHistoryEntry = { ...result, timestamp: Date.now() }
  const entries = [entry, ...loadSpeedHistory()].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or unavailable — history is best-effort.
  }
}

export function clearSpeedHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — nothing to clear.
  }
}

export function formatHistoryTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
