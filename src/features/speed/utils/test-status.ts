import { formatSpeedMbps } from '@/lib/format'
import type { SpeedResult, SpeedTestProgress } from '@/types'

/** What a speed test's live region announces: the current phase while a test
 *  runs, the headline result once one completes, and nothing after a stop or
 *  failure (a failure has its own alert). */
export function testStatusText(isTesting: boolean, progress: SpeedTestProgress, result: SpeedResult | null): string {
  if (isTesting) return progress.message || 'Starting…'
  if (progress.phase !== 'complete' || result == null) return ''
  return `Speed test complete. Download ${formatSpeedMbps(result.downloadMbps)}, upload ${formatSpeedMbps(result.uploadMbps)}.`
}
