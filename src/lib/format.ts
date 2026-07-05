import { isValidRate, sanitizeRate } from '@/types'

export function formatSpeedMbps(mbps: number): string {
  if (!isValidRate(mbps)) return '—'
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  return `${mbps.toFixed(1)} Mbps`
}

export interface SplitSpeed {
  readonly value: string
  readonly unit: string
}

export function splitSpeedMbps(mbps: number): SplitSpeed {
  const safe = sanitizeRate(mbps)

  if (safe >= 1000) {
    const gbps = safe / 1000
    return {
      value: gbps >= 10 ? gbps.toFixed(1) : gbps.toFixed(2),
      unit: 'Gbps',
    }
  }
  if (safe >= 100) {
    return { value: Math.round(safe).toString(), unit: 'Mbps' }
  }
  return { value: safe.toFixed(1), unit: 'Mbps' }
}

export function formatChannel(channel: number | null, frequency: number | null): string | null {
  if (channel == null || !Number.isFinite(channel)) return null
  return frequency != null && Number.isFinite(frequency)
    ? `${channel} (${frequency} MHz)`
    : `${channel}`
}

/** Wi‑Fi band derived from the channel's centre frequency (MHz). */
export function formatBand(frequency: number | null): string | null {
  if (frequency == null || !Number.isFinite(frequency)) return null
  if (frequency >= 5925) return '6 GHz'
  if (frequency >= 4900) return '5 GHz'
  if (frequency >= 2400) return '2.4 GHz'
  return null
}

const WIFI_STANDARD_LABELS: Record<string, string> = {
  '802.11be': 'Wi‑Fi 7 (802.11be)',
  '802.11ax': 'Wi‑Fi 6 (802.11ax)',
  '802.11ac': 'Wi‑Fi 5 (802.11ac)',
  '802.11n': 'Wi‑Fi 4 (802.11n)',
}

/** Prettify a Wi‑Fi standard, dropping uninformative generic values. */
export function formatWifiStandard(standard: string | null | undefined): string | null {
  const value = standard?.trim().toLowerCase()
  if (!value || value === 'wireless' || value === 'unknown') return null
  return WIFI_STANDARD_LABELS[value] ?? standard!.trim()
}

export function formatSignalStrength(strength: number): string {
  const safe = sanitizeRate(strength)
  if (safe >= 80) return 'Excellent'
  if (safe >= 60) return 'Good'
  if (safe >= 40) return 'Fair'
  return 'Weak'
}

export function formatOperState(state: string): string {
  if (state === 'up') return 'Connected'
  if (state === 'down') return 'Disconnected'
  return state
}

export function formatConnectionType(type: string): string {
  if (type === 'wifi') return 'Wi‑Fi'
  if (type === 'ethernet') return 'Ethernet'
  if (type === 'unknown') return 'Other'
  return type
}

export function formatDisplayValue(value: string | null | undefined): string {
  return value?.trim() ? value : '—'
}

export function formatDuplex(duplex: string | null | undefined): string | null {
  if (!duplex) return null
  if (duplex === 'full') return 'Full duplex'
  if (duplex === 'half') return 'Half duplex'
  return duplex
}

export function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return `${ms.toFixed(1)} ms`
}

export function isDisplayableMbps(mbps: number | null | undefined): mbps is number {
  return mbps != null && Number.isFinite(mbps) && mbps > 0
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export interface SplitBytes {
  readonly value: string
  readonly unit: string
}

/** 1_530_000_000 → { value: "1.53", unit: "GB" } (decimal units, like ISPs bill). */
export function splitBytes(bytes: number): SplitBytes {
  if (!Number.isFinite(bytes) || bytes < 0) return { value: '0', unit: 'B' }
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2
  return { value: value.toFixed(digits), unit: BYTE_UNITS[unit] ?? 'B' }
}

export function formatBytes(bytes: number): string {
  const { value, unit } = splitBytes(bytes)
  return `${value} ${unit}`
}

const TIME_AGO_RELATIVE_MS = 24 * 60 * 60 * 1000

/** Absolute timestamp, e.g. "Jul 4, 8:30 PM" — matches speed history cards. */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

/** Relative timestamp for recent times; absolute date after 24 h. */
export function formatTimeAgo(timestamp: number): string {
  const elapsed = Date.now() - timestamp
  if (elapsed >= TIME_AGO_RELATIVE_MS) return formatDateTime(timestamp)

  const seconds = Math.round(elapsed / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} h ago`
}
