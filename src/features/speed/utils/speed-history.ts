import { getNetworkApi } from '@/bridge/network-api'
import type { SpeedHistoryEntry, SpeedResult, SpeedRunContext } from '@/types'

/** Past speed test results, newest first. */
export async function getSpeedHistory(): Promise<SpeedHistoryEntry[]> {
  try {
    return await getNetworkApi().getSpeedHistory()
  } catch {
    return []
  }
}

export async function saveSpeedResult(result: SpeedResult, context: SpeedRunContext): Promise<void> {
  const entry: SpeedHistoryEntry = { ...result, ...context, timestamp: Date.now() }
  try {
    await getNetworkApi().saveSpeedResult(entry)
  } catch {
    // Best-effort: a failed write shouldn't surface an error.
  }
}

export async function clearSpeedHistory(): Promise<void> {
  try {
    await getNetworkApi().clearSpeedHistory()
  } catch {
    // Nothing the user can do about a failed clear.
  }
}
