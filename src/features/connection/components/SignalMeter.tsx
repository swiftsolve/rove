import { cva, cx } from 'class-variance-authority'

import { signalBarCount, signalLevel, signalWord } from '@/features/connection/utils/wifi-signal'
import { BarMeter } from '@/ui'

const signalMeterVariants = cva('signal-meter flex items-center', {
  variants: {
    level: { good: 'text-status-positive', fair: 'text-status-warning', poor: 'text-status-negative' },
  },
})

type SignalMeterProps = {
  /** 0–100. */
  strength: number
  /** False beside words that already say the rating, so a screen reader doesn't read it twice. */
  shouldAnnounce?: boolean
  className?: string
}

/**
 * The Wi‑Fi signal as four bars, coloured by how good it is. As tall as the
 * text's capitals, on the strip's meta line and in the Signal row.
 */
export function SignalMeter({ strength, shouldAnnounce = true, className }: SignalMeterProps) {
  const meterClassName = cx(signalMeterVariants({ level: signalLevel(strength) }), className)
  if (!shouldAnnounce) {
    return (
      <span className={meterClassName} aria-hidden>
        <BarMeter value={signalBarCount(strength)} />
      </span>
    )
  }
  return (
    <span
      className={meterClassName}
      role="meter"
      aria-label={`Wi‑Fi signal: ${signalWord(strength)}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <BarMeter value={signalBarCount(strength)} />
    </span>
  )
}
