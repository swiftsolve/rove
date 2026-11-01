import { useEffect, useState } from 'react'
import { cva } from 'class-variance-authority'
import { StatusDot, usePresence } from '@/ui'
import { LEAVING, SCAN_EXIT_MS, STATUS_DOT } from '@/features/devices/utils/status-slot'

/** `isLeaving` plays the slide-out. Inline-block, not flex, so its dot can be
 *  nudged to the text's optical middle with vertical-align (flex centring reads
 *  a touch low). */
const scanVariants = cva('inline-block whitespace-nowrap text-tertiary', {
  variants: {
    isLeaving: { true: LEAVING, false: 'animate-scan-slide-in' },
  },
})

/** One stage word: waits below, settles as the current stage, then drifts up,
 *  so entering and leaving read as one continuous rising motion. */
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

type ScanPhaseState = 'past' | 'current' | 'next'

// The scan runs its stages concurrently and reports no per-stage progress, so
// ScanStatus steps through them on a timer — a forward-reading approximation, in
// the pipeline's real order (sweep the subnet, listen for announcements, then
// name and classify what replied). It holds on the last stage until the scan ends.
const SCAN_PHASES = ['Sweeping', 'Listening', 'Identifying'] as const
const SCAN_PHASE_MS = 1300

function scanPhaseState(index: number, currentPhase: number): ScanPhaseState {
  if (index === currentPhase) return 'current'
  return index < currentPhase ? 'past' : 'next'
}

// A pulsing green dot + one-word stage. On first load it fills the subtitle
// slot alone; on a rescan it trails the subnet.
//
// Motion: the indicator slides in from the left when a scan starts, the stage
// words fade upward through each other while it runs, and on completion the
// whole thing slides back out to the left. The exit is why it takes `isActive`
// instead of being conditionally rendered — it stays mounted for SCAN_EXIT_MS
// after the scan ends so the slide-out can play.
//
// All three words are stacked (a hidden sizer holds the width to the longest
// so the layout never jumps); each one's state class (past, current, next) places it.
//
// `isLiveRegion` makes it its own polite live region; off when it shares the
// subnet's indicator slot, which is the live region there.
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

  // Step the stage word while a scan runs.
  useEffect(() => {
    if (!isActive) return
    const intervalId = window.setInterval(
      () => setPhase((p) => Math.min(p + 1, SCAN_PHASES.length - 1)),
      SCAN_PHASE_MS,
    )
    return () => window.clearInterval(intervalId)
  }, [isActive])

  if (!isMounted) return null
  return (
    <span
      className={scanVariants({ isLeaving: !isActive })}
      role={isLiveRegion ? 'status' : undefined}
      aria-hidden={isActive ? undefined : true}
    >
      <StatusDot pulse="busy" className={STATUS_DOT} />
      {/* The stage words are stacked so they cross-fade in place; a hidden sizer
          (the longest label) holds the box to a stable width so nothing reflows. */}
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
