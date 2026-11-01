import { cva, cx } from 'class-variance-authority'
import type { CapabilityLevel } from '@/types'
import { cn } from '@/lib/cn'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import {
  CAPABILITY_LEVEL_FILL_COLORS,
  CAPABILITY_LEVEL_TEXT_COLORS,
} from '@/features/capabilities/utils/capability-level-colors'

const LEVEL_RANK: Record<CapabilityLevel, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unsupported: 0,
}

// Each bar's height, shortest first. The compact ones stay on whole pixels, or
// the thin bars blur across subpixel boundaries and read fuzzy.
const SEGMENTS = [
  { height: 'h-6', compactHeight: 'h-[3px]' },
  { height: 'h-8', compactHeight: 'h-[5px]' },
  { height: 'h-10', compactHeight: 'h-[7px]' },
  { height: 'h-12', compactHeight: 'h-[9px]' },
]

// The bars take the level's fill colour (the same as the row's icon); muted is
// the look an unsupported capability already has, so every "no rating right
// now" meter reads the same.
const rootVariants = cva('inline-flex shrink-0 items-center gap-8 text-xs font-medium', {
  variants: {
    tone: { ...CAPABILITY_LEVEL_FILL_COLORS, muted: 'text-tertiary' },
  },
})

const barsVariants = cva('inline-flex items-end gap-2', {
  variants: {
    isCompact: { true: 'h-[9px]', false: 'h-12' },
  },
})

const segVariants = cva('', {
  variants: {
    // Compact (the Home strip) drops the pill radius to a hairline, again so the
    // thin bars stay sharp.
    isCompact: { true: 'w-2 rounded-[1px]', false: 'w-[3px] rounded-full' },
    fill: {
      lit: 'bg-current',
      // A faded tint of the level colour, so the meter reads as one monochrome
      // unit rather than colour-on-grey.
      unlit: 'bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-lg),transparent)]',
      // Dimmed: dark, dim greys set directly rather than tinted from currentColor,
      // to keep full control of them.
      dimmed: 'bg-fill-default',
      dimmedLit: 'bg-fill-strong',
    },
  },
})

// The level word takes the darker text shade, which needs 4.5:1 where the bars
// only need 3:1.
const labelVariants = cva('whitespace-nowrap', {
  variants: {
    level: CAPABILITY_LEVEL_TEXT_COLORS,
  },
})

type SegFill = 'lit' | 'unlit' | 'dimmed' | 'dimmedLit'

function segFill(isOn: boolean, isMuted: boolean, isDimmed: boolean): SegFill {
  if (isDimmed) return isOn ? 'dimmedLit' : 'dimmed'
  if (isMuted) return 'unlit'
  return isOn ? 'lit' : 'unlit'
}

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
    // A <span> (styled inline-flex) so the meter can sit inside a button row.
    <span className={rootVariants({ tone: isMuted ? 'muted' : level })}>
      <span className={cn(barsVariants({ isCompact }), barsClassName)} aria-hidden>
        {SEGMENTS.map((segment, i) => (
          <span
            key={i}
            className={cx(
              segVariants({ isCompact, fill: segFill(i < rank, isMuted, isDimmed) }),
              isCompact ? segment.compactHeight : segment.height,
            )}
          />
        ))}
      </span>
      {shouldShowLabel && (
        <span className={labelVariants({ level })}>{CAPABILITY_LEVEL_LABELS[level]}</span>
      )}
    </span>
  )
}
