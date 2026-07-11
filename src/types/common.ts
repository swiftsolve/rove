/** Standard teardown function returned by subscriptions. */
export type Unsubscribe = () => void

/** Clamp a number between min and max. */
function clamp(value: number, min: number, max: number): number {
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

/** Map Wi‑Fi signal strength from dBm to a 0–100 scale. */
export function dbmToSignalPercent(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0
  return clamp(2 * (dbm + 100), 0, 100)
}
