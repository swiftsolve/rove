import type { SpeedResult, SpeedTestProgress } from '@/types'
import { formatSpeedMbps } from '@/utils/format'

/**
 * What a speed test's live region announces: the current phase while a test
 * runs, the headline result once one completes, and nothing after a stop or
 * failure (a failure has its own alert).
 */
export function testStatusText(isTesting: boolean, progress: SpeedTestProgress, result: SpeedResult | null): string {
  if (isTesting) return progress.message || 'Starting…'
  if (progress.phase !== 'complete' || result == null) return ''
  const download = formatSpeedMbps(result.downloadMbps) ?? 'unknown'
  const upload = formatSpeedMbps(result.uploadMbps) ?? 'unknown'
  return `Speed test complete. Download ${download}, upload ${upload}.`
}
