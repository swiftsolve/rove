import { isValidRate, sanitizeRate } from '@/types'

export function formatSpeedMbps(mbps: number): string {
  if (!isValidRate(mbps)) return '—'
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`
  return `${mbps.toFixed(1)} Mbps`
}

export interface SplitSpeed {
  value: string
  unit: string
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
  const normalized = standard?.trim().toLowerCase()
  if (!normalized || normalized === 'wireless' || normalized === 'unknown') return null
  return WIFI_STANDARD_LABELS[normalized] ?? standard!.trim()
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

/** MAC addresses always display upper-case (A4:C3:F0:…), wherever they appear. */
export function formatMac(mac: string | null | undefined): string {
  return mac?.trim() ? mac.trim().toUpperCase() : '—'
}

/**
 * Whether an OS-reported Wi‑Fi security string means the network is secured.
 * Mirrors the backend's QR encryption mapping: empty, `--`, `None` and `Open`
 * read as open; anything else present (WEP, WPA*, RSN, 802.1X…) as secured.
 * Null when the OS didn't report security at all.
 */
export function isSecuredWifi(security: string | null | undefined): boolean | null {
  if (security == null) return null
  const normalized = security.trim().toUpperCase()
  return !(normalized === '' || normalized === '--' || normalized === 'NONE' || normalized === 'OPEN')
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
  value: string
  unit: string
}

/** Three significant figures, e.g. 153 / 15.3 / 1.53; whole bytes never get decimals. */
function byteFractionDigits(value: number, unitIndex: number): number {
  if (value >= 100 || unitIndex === 0) return 0
  if (value >= 10) return 1
  return 2
}

/** 1_530_000_000 → { value: "1.53", unit: "GB" } (decimal units, like ISPs bill). */
export function splitBytes(bytes: number): SplitBytes {
  if (!Number.isFinite(bytes) || bytes < 0) return { value: '0', unit: 'B' }
  let value = bytes
  let unitIndex = 0
  while (value >= 1000 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1000
    unitIndex += 1
  }
  return {
    value: value.toFixed(byteFractionDigits(value, unitIndex)),
    unit: BYTE_UNITS[unitIndex] ?? 'B',
  }
}

export function formatBytes(bytes: number): string {
  const { value, unit } = splitBytes(bytes)
  return `${value} ${unit}`
}

/** Absolute timestamp, e.g. "Jul 4, 8:30 PM" — matches speed history cards. */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

/** Compact human duration, e.g. "45 s", "12 min", "3 h 20 min", "2 d 4 h". Used
 *  for service outage lengths on the Services timeline. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remMinutes = minutes % 60
    return remMinutes > 0 ? `${hours} h ${remMinutes} min` : `${hours} h`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days} d ${remHours} h` : `${days} d`
}

/** The resolution to read the clock at for `formatTimeAgo` (see `useNow`). Its
 *  finest boundary is "just now", at 45 s, so 10 s keeps the label honest
 *  without re-rendering every caller once a second. */
export const TIME_AGO_RESOLUTION_MS = 10_000

/** Past this age `formatTimeAgo` switches from relative to an absolute date. */
const TIME_AGO_RELATIVE_MS = 24 * 60 * 60 * 1000

/** Relative timestamp for recent times; absolute date after 24 h. `now` is the
 *  clock to measure against — see `useNow`, which is what makes the label age on
 *  screen rather than at whatever moment the caller last re-rendered. */
export function formatTimeAgo(timestamp: number, now: number): string {
  const elapsed = now - timestamp
  if (elapsed >= TIME_AGO_RELATIVE_MS) return formatDateTime(timestamp)

  const seconds = Math.round(elapsed / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} h ago`
}
