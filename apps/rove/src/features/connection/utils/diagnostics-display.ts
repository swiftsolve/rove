import type { MetricStatus } from '@swiftsolve/rove-ui'

import { isMeasuredLatency, type IspInfo } from '@/types'

/** Gateway round trips up to this read as healthy (green). */
const GOOD_LATENCY_MAX_MS = 40
/** Up to this they read as sluggish (amber); anything slower reads as bad. */
const WARN_LATENCY_MAX_MS = 120
/** Any packet loss is worth flagging; past this it reads as bad, not just amber. */
const WARN_LOSS_MAX_PCT = 2

export function isSameText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function formatPercent(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`
}

export function latencyStatus(ms: number): MetricStatus {
  if (!isMeasuredLatency(ms)) return 'negative'
  if (ms <= GOOD_LATENCY_MAX_MS) return 'positive'
  if (ms <= WARN_LATENCY_MAX_MS) return 'warning'
  return 'negative'
}

export function lossStatus(pct: number): MetricStatus {
  if (pct <= 0) return 'positive'
  if (pct <= WARN_LOSS_MAX_PCT) return 'warning'
  return 'negative'
}

export function formatLocation(isp: IspInfo): string | null {
  const parts = [isp.city, isp.region, isp.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * What the screen-reader status line says: that a run finished. Its start is
 * the page header's `status`, which announces itself, so saying it here too
 * would read it twice.
 */
export function runStatusText(isRunning: boolean, hasDiagnostics: boolean): string {
  return !isRunning && hasDiagnostics ? 'Connection checks finished.' : ''
}
