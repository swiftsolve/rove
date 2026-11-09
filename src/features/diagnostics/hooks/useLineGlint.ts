import { useEffect, useState } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

// One steady speed, so the run across both lines reads as one trip.
export const GLINT_DURATION_MS = 700

// The glint is a mask 40% of the line wide: at -67% it sits just off the
// line's start, at 167% just past its end.
export const GLINT_HIDDEN_POSITION = '-67% 0'
const GLINT_KEYFRAMES: Keyframe[] = [{ maskPosition: GLINT_HIDDEN_POSITION }, { maskPosition: '167% 0' }]

/**
 * Runs one glint along `glintLine` each time `glintCount` goes up. The Web
 * Animations API restarts the glint without remounting the line, so a line
 * whose dashes flow keeps them in step with the line beneath it.
 */
export function useLineGlint({
  glintLine,
  glintCount,
  delayMs,
  isEnabled,
}: {
  glintLine: Element | null
  glintCount: number
  delayMs: number
  isEnabled: boolean
}): void {
  // A line that remounts (its colour changed) waits for the next glint.
  const [mountGlintCount] = useState(glintCount)
  useEffect(() => {
    if (!glintLine || !isEnabled || glintCount === mountGlintCount) return
    if (matchMedia(REDUCED_MOTION).matches) return
    const glint = glintLine.animate(GLINT_KEYFRAMES, {
      duration: GLINT_DURATION_MS,
      delay: delayMs,
      easing: 'linear',
      fill: 'backwards',
    })
    return () => glint.cancel()
  }, [glintLine, glintCount, mountGlintCount, delayMs, isEnabled])
}
