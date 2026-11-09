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
    let isCancelled = false
    let glint: Animation | null = null
    // A glint over a card still fading in runs ahead of the card itself.
    void waitForEntrance(glintLine).then(() => {
      if (!isCancelled) glint = startGlint(glintLine)
    })
    return () => {
      isCancelled = true
      glint?.cancel()
    }
  }, [glintLine, glintCount, skippedGlintCount])
}

/**
 * Resolves once every finite animation on `element`'s ancestors is over: the
 * page's staggered fade-up that brings its card in, on opening. At once when
 * none is running.
 */
async function waitForEntrance(element: Element): Promise<void> {
  const entrances: Promise<unknown>[] = []
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    for (const animation of ancestor.getAnimations()) {
      const isFinite = animation.effect?.getComputedTiming().endTime !== Infinity
      // A cancelled entrance rejects `finished`; the wait ends all the same.
      if (isFinite) entrances.push(animation.finished.catch(() => undefined))
    }
  }
  await Promise.all(entrances)
}
