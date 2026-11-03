// One set of thresholds for the bars, their colour and the word, so a signal
// with three green bars never reads "Fair".

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
  const bars = signalBarCount(strength)
  if (bars >= 3) return 'good'
  if (bars === 2) return 'fair'
  return 'poor'
}

const SIGNAL_WORDS = ['Weak', 'Fair', 'Good', 'Excellent'] as const

/** The signal in a word, one per bar count: Weak, Fair, Good, Excellent. */
export function signalWord(strength: number): string {
  return SIGNAL_WORDS[signalBarCount(strength) - 1] ?? 'Weak'
}
