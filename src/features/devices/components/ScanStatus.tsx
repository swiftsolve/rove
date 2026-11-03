import { cva } from 'class-variance-authority'
import { type JSX, useEffect, useState } from 'react'

import { LEAVING, SCAN_EXIT_MS, STATUS_DOT } from '@/features/devices/utils/status-slot'
import { StatusDot, usePresence, type VariantOf } from '@/ui'

/**
 * `isLeaving` plays the slide-out. Inline-block, not flex, so its dot can be
 * nudged to the text's optical middle with vertical-align (flex centring reads
 * a touch low).
 */
const scanVariants = cva('inline-block whitespace-nowrap text-tertiary', {
  variants: {
    isLeaving: { true: LEAVING, false: 'animate-scan-slide-in' },
  },
  defaultVariants: { isLeaving: false },
})

/**
 * One stage word: waits below, settles as the current stage, then drifts up,
 * so entering and leaving read as one continuous rising motion.
 */
const scanPhaseVariants = cva(
  'absolute top-0 left-0 transition-[opacity,transform] duration-(--duration-normal) ease-out',
  {
    variants: {
      state: {
        past: 'opacity-0 transform-[translateY(-5px)]',
        current: 'opacity-100 transform-none',
        next: 'opacity-0 transform-[translateY(5px)]',
      },
    },
  },
)

type ScanPhaseState = VariantOf<typeof scanPhaseVariants, 'state'>

// The scan runs its stages concurrently and reports no per-stage progress, so
// these step on a timer, in pipeline order, holding on the last until it ends.
const SCAN_PHASES = ['Sweeping', 'Listening', 'Identifying'] as const
const SCAN_PHASE_MS = 1300

function scanPhaseState(index: number, currentPhase: number): ScanPhaseState {
  if (index === currentPhase) return 'current'
  return index < currentPhase ? 'past' : 'next'
}

/**
 * A pulsing dot and a one-word stage. Takes `isActive` rather than being
 * conditionally rendered so it stays mounted for SCAN_EXIT_MS to slide out.
 * `isLiveRegion` is off when it shares the subnet's slot, which is the live
 * region.
 */
export function ScanStatus({
  isActive,
  isLiveRegion,
}: {
  isActive: boolean
  isLiveRegion: boolean
}): JSX.Element | null {
  const [phase, setPhase] = useState(0)
  const isMounted = usePresence(isActive, SCAN_EXIT_MS)
  // Rewind once unmounted, so the next scan starts from the first stage word.
  if (!isMounted && phase !== 0) setPhase(0)

  useEffect(() => {
    if (!isActive) return
    const intervalId = window.setInterval(() => setPhase((p) => Math.min(p + 1, SCAN_PHASES.length - 1)), SCAN_PHASE_MS)
    return () => window.clearInterval(intervalId)
  }, [isActive])

  if (!isMounted) return null
  return (
    <span
      className={scanVariants({ isLeaving: !isActive })}
      role={isLiveRegion ? 'status' : undefined}
      aria-hidden={isActive ? undefined : true}
    >
      <StatusDot tone="positive" pulse="busy" className={STATUS_DOT} />
      {/* A hidden sizer (the longest word) keeps the stacked words from reflowing. */}
      <span className="relative inline-block">
        <span className="invisible" aria-hidden>
          Identifying
        </span>
        {SCAN_PHASES.map((label, i) => (
          <span
            key={label}
            className={scanPhaseVariants({ state: scanPhaseState(i, phase) })}
            aria-hidden={i !== phase}
          >
            {label}
          </span>
        ))}
      </span>
    </span>
  )
}
