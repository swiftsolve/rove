/** How a Wi‑Fi signal reads at a glance, which sets the meter's colour. */
export type SignalLevel = 'good' | 'fair' | 'poor'

/** How many of the meter's four bars a 0–100 signal strength fills. */
export function signalBarCount(strength: number): number {
  if (strength >= 80) return 4
  if (strength >= 55) return 3
  if (strength >= 35) return 2
  return 1
}

export function signalLevel(strength: number): SignalLevel {
  if (strength >= 55) return 'good'
  if (strength >= 35) return 'fair'
  return 'poor'
}
