import { isValidRate, sanitizeRate } from '@/types'

/** A number as it's shown, and its unit: `{ value: "1.53", unit: "GB" }`. */
export type ValueWithUnit = {
  value: string
  unit: string
}

// Each unit and precision is chosen from the value as it will be shown, after
// rounding, so 999.96 Mbps reads "1.0 Gbps", never "1000.0 Mbps".

/** The speed with its unit, or null for one that isn't a real rate. */
export function formatSpeedMbps(mbps: number): string | null {
  if (!isValidRate(mbps)) return null
  if (Number(mbps.toFixed(1)) < 1000) return `${mbps.toFixed(1)} Mbps`
  return `${(mbps / 1000).toFixed(1)} Gbps`
}

/** Three significant figures: 41.2 / 412 Mbps, 4.12 / 41.2 Gbps. Anything but a real rate reads as 0. */
export function splitSpeedMbps(mbps: number): ValueWithUnit {
  const safe = sanitizeRate(mbps)
  if (Number(safe.toFixed(1)) < 100) return { value: safe.toFixed(1), unit: 'Mbps' }
  if (Math.round(safe) < 1000) return { value: Math.round(safe).toString(), unit: 'Mbps' }
  const gbps = safe / 1000
  return { value: Number(gbps.toFixed(2)) < 10 ? gbps.toFixed(2) : gbps.toFixed(1), unit: 'Gbps' }
}

export function formatChannel(channel: number | null, frequency: number | null): string | null {
  if (channel == null || !Number.isFinite(channel)) return null
  return frequency != null && Number.isFinite(frequency) ? `${channel} (${frequency} MHz)` : `${channel}`
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
  const trimmed = standard?.trim()
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase()
  if (normalized === 'wireless' || normalized === 'unknown') return null
  return WIFI_STANDARD_LABELS[normalized] ?? trimmed
}

export function formatOperState(state: string): string {
  if (state === 'up') return 'Connected'
  if (state === 'down') return 'Disconnected'
  return state
}

const CONNECTION_TYPE_LABELS: Record<string, string> = {
  wifi: 'Wi‑Fi',
  ethernet: 'Ethernet',
  virtual: 'Virtual',
  unknown: 'Other',
}

export function formatConnectionType(type: string): string {
  return CONNECTION_TYPE_LABELS[type] ?? type
}

/** The value trimmed, or null when it's blank. */
export function formatDisplayValue(value: string | null | undefined): string | null {
  return value?.trim() || null
}

/** MAC addresses always display upper-case (A4:C3:F0:…), wherever they appear. */
export function formatMac(mac: string | null | undefined): string | null {
  return mac?.trim() ? mac.trim().toUpperCase() : null
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

/** 12.34 → { value: "12.3", unit: "ms" }, or null for one that isn't a real duration. */
export function splitLatencyMs(ms: number): ValueWithUnit | null {
  if (!Number.isFinite(ms) || ms < 0) return null
  return { value: ms.toFixed(1), unit: 'ms' }
}

/** The latency in ms ("12.3 ms"), or null for one that isn't a real duration. */
export function formatLatencyMs(ms: number): string | null {
  const split = splitLatencyMs(ms)
  return split && `${split.value} ${split.unit}`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** Three significant figures, e.g. 153 / 15.3 / 1.53; whole bytes never get decimals. */
function byteFractionDigits(value: number, unitIndex: number): number {
  if (value >= 100 || unitIndex === 0) return 0
  if (value >= 10) return 1
  return 2
}

/** 1_530_000_000 → { value: "1.53", unit: "GB" } (decimal units, like ISPs bill). */
export function splitBytes(bytes: number): ValueWithUnit {
  if (!Number.isFinite(bytes) || bytes < 0) return { value: '0', unit: 'B' }
  let value = bytes
  let unitIndex = 0
  const isLastUnit = (): boolean => unitIndex === BYTE_UNITS.length - 1
  // Step up while the value, as it would be shown, reaches 1000: 999.6 KB is "1.00 MB".
  while (!isLastUnit() && Number(value.toFixed(byteFractionDigits(value, unitIndex))) >= 1000) {
    value /= 1000
    unitIndex += 1
  }
  // Rounding can cross a precision step too: 9.996 KB shows as "10.0", not "10.00".
  const shown = Number(value.toFixed(byteFractionDigits(value, unitIndex)))
  return {
    value: value.toFixed(byteFractionDigits(shown, unitIndex)),
    unit: BYTE_UNITS[unitIndex] ?? 'B',
  }
}

export function formatBytes(bytes: number): string {
  const { value, unit } = splitBytes(bytes)
  return `${value} ${unit}`
}

// Built once: a formatter is costly to make, and the history list formats many.
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Absolute timestamp in the user's locale, e.g. "Jul 4, 8:30 PM", as on the speed history cards. */
export function formatDateTime(timestamp: number): string {
  return DATE_TIME_FORMATTER.format(new Date(timestamp))
}

/** Compact human duration, e.g. "45 s", "12 min", "3 h 20 min", "2 d 4 h". */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const leftoverMinutes = minutes % 60
    return leftoverMinutes > 0 ? `${hours} h ${leftoverMinutes} min` : `${hours} h`
  }
  const days = Math.floor(hours / 24)
  const leftoverHours = hours % 24
  return leftoverHours > 0 ? `${days} d ${leftoverHours} h` : `${days} d`
}

/**
 * The resolution to read the clock at for `formatTimeAgo` (see `useNow`). Its
 * finest boundary is "just now", at 45 s, so 10 s keeps the label honest
 * without re-rendering every caller once a second.
 */
export const TIME_AGO_RESOLUTION_MS = 10_000

/** Past this age `formatTimeAgo` switches from relative to an absolute date. */
const TIME_AGO_MAX_RELATIVE_MS = 24 * 60 * 60 * 1000

/**
 * Relative timestamp for recent times; absolute date after 24 h. `now` comes
 * from `useNow`, so the label ages on screen. Hours are whole ones passed, as
 * in `formatDuration`: 91 min is "1 h ago". Null for a time that isn't one.
 */
export function formatTimeAgo(timestamp: number, now: number): string | null {
  const elapsed = now - timestamp
  if (!Number.isFinite(elapsed)) return null
  if (elapsed >= TIME_AGO_MAX_RELATIVE_MS) return formatDateTime(timestamp)

  const seconds = Math.round(elapsed / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} h ago`
}

/** A list page's title: "3 devices" once some are listed, else the page's own name. */
export function countTitle(count: number, noun: string, pageName: string): string {
  return count === 0 ? pageName : formatCount(count, noun)
}

/** "1 device", "3 devices". Every noun the UI counts takes a plain -s. */
export function formatCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
