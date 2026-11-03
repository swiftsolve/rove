/** Detaches a listener; every `on*` subscription returns one. */
export type Unsubscribe = () => void

/** True when `value` is a usable non-negative number. */
export function isValidRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/** Coerce invalid rates to zero for calculations and live readouts. */
export function sanitizeRate(value: number): number {
  return isValidRate(value) ? value : 0
}
