import type { SpeedHistoryEntry, SpeedResult, SpeedRunContext } from '@/types'
import { getNetworkApi } from '@/bridge/networkApi'

// Re-exported so existing imports from this module keep resolving.
export type { SpeedHistoryEntry, SpeedRunContext } from '@/types'
export { formatDateTime as formatHistoryTimestamp } from '@/lib/format'

/** An entry as older versions saved it: only the core result fields are guaranteed. */
type LegacyEntry = SpeedResult & { timestamp: number }

/** localStorage key used before history moved into the local database. */
const LEGACY_STORAGE_KEY = 'rove.speed-history.v1'

function isLegacyEntry(value: unknown): value is LegacyEntry {
  if (typeof value !== 'object' || value == null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.timestamp === 'number' &&
    typeof entry.downloadMbps === 'number' &&
    typeof entry.uploadMbps === 'number'
  )
}

/** Fill in fields absent from entries saved by older versions. */
function upgradeLegacyEntry(entry: LegacyEntry): SpeedHistoryEntry {
  const raw = entry as unknown as Record<string, unknown>
  return {
    ...entry,
    connectionType: typeof raw.connectionType === 'string' ? raw.connectionType : 'unknown',
    networkName: typeof raw.networkName === 'string' ? raw.networkName : null,
    linkSpeedMbps: typeof raw.linkSpeedMbps === 'number' ? raw.linkSpeedMbps : null,
    frequency: typeof raw.frequency === 'number' ? raw.frequency : null,
  }
}

/** Past speed test results, newest first. */
export async function getSpeedHistory(): Promise<SpeedHistoryEntry[]> {
  try {
    return await getNetworkApi().getSpeedHistory()
  } catch {
    return []
  }
}

export async function saveSpeedResult(
  result: SpeedResult,
  context: SpeedRunContext,
): Promise<void> {
  const entry: SpeedHistoryEntry = { ...result, ...context, timestamp: Date.now() }
  try {
    await getNetworkApi().saveSpeedResult(entry)
  } catch {
    // Persistence is best-effort — a failed write shouldn't surface an error.
  }
}

export async function clearSpeedHistory(): Promise<void> {
  try {
    await getNetworkApi().clearSpeedHistory()
  } catch {
    // Ignore — nothing the user can do about a failed clear.
  }
}

/**
 * One-time move of any results still sitting in localStorage into the database,
 * then drop the old key. Safe to call on every startup: it no-ops once the key
 * is gone.
 */
export async function migrateLegacySpeedHistory(): Promise<void> {
  let stored: string | null
  try {
    stored = localStorage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return
  }
  if (!stored) return

  try {
    const parsed: unknown = JSON.parse(stored)
    const entries = Array.isArray(parsed) ? parsed.filter(isLegacyEntry).map(upgradeLegacyEntry) : []
    if (entries.length > 0) {
      await getNetworkApi().importSpeedHistory(entries)
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Leave the key in place so a later run can retry the import.
  }
}
