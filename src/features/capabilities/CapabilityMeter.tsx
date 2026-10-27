import type { CapabilityLevel } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import { cx } from '@/lib/cx'
import styles from './CapabilityMeter.module.css'

const LEVEL_RANK: Record<CapabilityLevel, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unsupported: 0,
}

const SEGMENTS = [0, 1, 2, 3]

interface CapabilityMeterProps {
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

export function CapabilityMeter({
  level,
  shouldShowLabel = true,
  isCompact = false,
  isMuted = false,
  isDimmed = false,
  barsClassName,
}: CapabilityMeterProps): JSX.Element {
  const rank = LEVEL_RANK[level]

  return (
    <div
      className={cx(
        styles.root,
        isCompact && styles.isCompact,
        isMuted && styles.isMuted,
        isDimmed && styles.isDimmed,
      )}
      data-level={level}
    >
      <span className={cx(styles.bars, barsClassName)} aria-hidden>
        {SEGMENTS.map((i) => (
          <span key={i} className={cx(styles.seg, i < rank && styles.isOn)} />
        ))}
      </span>
      {shouldShowLabel && (
        <span className={styles.label}>{CAPABILITY_LEVEL_LABELS[level]}</span>
      )}
    </div>
  )
}
