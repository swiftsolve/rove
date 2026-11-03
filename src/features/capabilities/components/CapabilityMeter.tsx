import { cva } from 'class-variance-authority'

import {
  CAPABILITY_LEVEL_FILL_COLORS,
  CAPABILITY_LEVEL_TEXT_COLORS,
} from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import type { CapabilityLevel } from '@/types'
import { BarMeter } from '@/ui'

const LEVEL_BAR_COUNT: Record<CapabilityLevel, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unsupported: 0,
}

// Muted reuses the unsupported look, so every "no rating now" meter reads the same.
const rootVariants = cva('inline-flex shrink-0 items-center gap-8 text-xs font-medium', {
  variants: {
    tone: { ...CAPABILITY_LEVEL_FILL_COLORS, muted: 'text-tertiary' },
  },
})

// The level word takes the darker text shade, which needs 4.5:1 where the bars
// only need 3:1.
const labelVariants = cva('whitespace-nowrap', {
  variants: {
    level: CAPABILITY_LEVEL_TEXT_COLORS,
  },
})

type CapabilityMeterProps = {
  level: CapabilityLevel
  shouldShowLabel?: boolean
  /** Smaller bars on whole pixels, for the Home strip's glanceable row. */
  isCompact?: boolean
  /** Grey, with every bar unlit: no rating to show right now (stale or not in yet). */
  isMuted?: boolean
  /** Dark, dim bars that read as inactive while a stale rating waits on a test. */
  isDimmed?: boolean
  /** Extra class on the bars, so a caller can nudge them into its layout. */
  barsClassName?: string
}

/**
 * A capability's rating as four bars in its level's colour, with the level's
 * name beside them unless `shouldShowLabel` is false.
 */
export function CapabilityMeter({
  level,
  shouldShowLabel = true,
  isCompact = false,
  isMuted = false,
  isDimmed = false,
  barsClassName,
}: CapabilityMeterProps) {
  return (
    // A <span> so the meter can sit inside a button.
    <span className={rootVariants({ tone: isMuted ? 'muted' : level })}>
      {/* Muted shows every bar unlit; dimmed still shows the stale rating, in grey. */}
      <BarMeter
        value={isMuted && !isDimmed ? 0 : LEVEL_BAR_COUNT[level]}
        size={isCompact ? 'xs' : 'lg'}
        isDimmed={isDimmed}
        className={barsClassName}
      />
      {shouldShowLabel && <span className={labelVariants({ level })}>{CAPABILITY_LEVEL_LABELS[level]}</span>}
    </span>
  )
}
