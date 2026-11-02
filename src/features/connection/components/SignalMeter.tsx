import { cva, cx } from 'class-variance-authority'
import { formatSignalStrength } from '@/lib/format'
import { signalBarCount, signalLevel } from '@/features/connection/utils/wifi-signal'
import { BarMeter } from '@/ui'

const signalMeterVariants = cva('flex items-center gap-8', {
  variants: {
    level: { good: 'text-status-positive', fair: 'text-status-warning', poor: 'text-status-negative' },
  },
})

type SignalMeterProps = {
  /** 0–100. */
  strength: number
  /** Beside the strip's title, or inside the expanded Signal row. */
  placement: 'strip' | 'details'
  className?: string
}

/** The Wi‑Fi signal as four bars, coloured by how good it is. */
export function SignalMeter({ strength, placement, className }: SignalMeterProps): JSX.Element {
  return (
    <div
      className={cx(signalMeterVariants({ level: signalLevel(strength) }), className)}
      role="meter"
      aria-label={`Wi‑Fi signal: ${formatSignalStrength(strength)}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* A size up beside the strip's title; as tall as the text's capitals in the Signal row. */}
      <BarMeter value={signalBarCount(strength)} size={placement === 'strip' ? 'md' : 'sm'} />
    </div>
  )
}
