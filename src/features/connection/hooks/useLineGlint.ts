import { useEffect, useEffectEvent, useState } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

// One steady speed, so the run across both lines reads as one trip.
export const GLINT_DURATION_MS = 700

// The glint is a mask 40% of the line wide: at -67% it sits just off the
// line's start, at 167% just past its end.
export const GLINT_HIDDEN_POSITION = '-67% 0'
const GLINT_KEYFRAMES: Keyframe[] = [{ maskPosition: GLINT_HIDDEN_POSITION }, { maskPosition: '167% 0' }]

/**
 * Runs one glint along `glintLine` each time `glintCount` goes up, and on
 * mount when `shouldGlintOnMount`. The Web Animations API restarts the glint
 * without remounting the line, so a line whose dashes flow keeps them in step
 * with the line beneath it.
 */
export function useLineGlint({
  glintLine,
  glintCount,
  delayMs,
  shouldGlintOnMount,
  isEnabled,
}: {
  glintLine: Element | null
  glintCount: number
  delayMs: number
  shouldGlintOnMount: boolean
  isEnabled: boolean
}): void {
  // The count the line mounted on, unless that mount glints too.
  const [skippedGlintCount] = useState(shouldGlintOnMount ? null : glintCount)
  // Read fresh when a glint comes due, so `isEnabled` turning back on doesn't
  // run one of its own.
  const startGlint = useEffectEvent((line: Element): Animation | null => {
    if (!isEnabled || matchMedia(REDUCED_MOTION).matches) return null
    return line.animate(GLINT_KEYFRAMES, {
      duration: GLINT_DURATION_MS,
      delay: delayMs,
      easing: 'linear',
      fill: 'backwards',
    })
  })
  useEffect(() => {
    if (!glintLine || glintCount === skippedGlintCount) return
    const glint = startGlint(glintLine)
    return () => glint?.cancel()
  }, [glintLine, glintCount, skippedGlintCount])
}
