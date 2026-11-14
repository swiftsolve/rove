// One set of thresholds for the bars, their colour and the word, so a signal
// with three green bars never reads "Fair".

/** How a Wi‑Fi signal reads at a glance, one per bar count, which sets the meter's colour. */
export type SignalLevel = 'weak' | 'fair' | 'good' | 'excellent'

/** How many of the meter's four bars a 0–100 signal strength fills. */
export function signalBarCount(strength: number): number {
  if (strength >= 80) return 4
  if (strength >= 55) return 3
  if (strength >= 35) return 2
  return 1
}

const SIGNAL_LEVELS: readonly SignalLevel[] = ['weak', 'fair', 'good', 'excellent']

export function signalLevel(strength: number): SignalLevel {
  return SIGNAL_LEVELS[signalBarCount(strength) - 1] ?? 'weak'
}

const SIGNAL_WORDS = ['Weak', 'Fair', 'Good', 'Excellent'] as const

/** The signal in a word, one per bar count: Weak, Fair, Good, Excellent. */
export function signalWord(strength: number): string {
  return SIGNAL_WORDS[signalBarCount(strength) - 1] ?? 'Weak'
}
