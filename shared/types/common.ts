/** Removes null and undefined from T. */
export type NonNullableValues<T> = {
  [K in keyof T]: NonNullable<T[K]>
}

/** Standard teardown function returned by subscriptions. */
export type Unsubscribe = () => void

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, safe))
}

/** True when value is a usable non-negative number. */
export function isValidRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/** Coerce invalid rates to zero for calculations and live readouts. */
export function sanitizeRate(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

/** Round to one decimal place. */
export function roundToOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}

/** Convert bytes transferred over a duration into megabits per second. */
export function bytesPerSecondToMbps(bytes: number, durationMs: number): number {
  if (!Number.isFinite(bytes) || bytes < 0 || durationMs <= 0) return 0
  return sanitizeRate((bytes * 8) / (durationMs / 1_000) / 1_000_000)
}

/** Convert an instantaneous bytes-per-second rate into megabits per second. */
export function instantaneousRateToMbps(bytesPerSecond: number, divisor = 1_000_000): number {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0 || divisor <= 0) return 0
  return sanitizeRate((bytesPerSecond * 8) / divisor)
}

/** Map Wi‑Fi signal strength from dBm to a 0–100 scale. */
export function dbmToSignalPercent(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0
  return clamp(2 * (dbm + 100), 0, 100)
}

/** Derive Wi‑Fi channel number from frequency in MHz. */
export function frequencyToChannel(mhz: number): number | null {
  if (!Number.isFinite(mhz)) return null
  if (mhz >= 2412 && mhz <= 2484) {
    return mhz === 2484 ? 14 : Math.round((mhz - 2407) / 5)
  }
  if (mhz >= 5000 && mhz <= 5900) {
    return Math.round((mhz - 5000) / 5)
  }
  return null
}
