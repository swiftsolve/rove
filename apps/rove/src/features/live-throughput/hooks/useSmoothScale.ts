import { useEffect, useRef, useState } from 'react'

/**
 * How fast the scale closes its gap: the time it takes to cover about two
 * thirds of it. Up is quick, so a spike is in scale before it scrolls into
 * view; down is gentler, so the trace grows calmly once a peak has left.
 */
const EASE_UP_MS = 60
const EASE_DOWN_MS = 150
/** Within this fraction of the target, the scale snaps onto it and the loop stops. */
const SETTLE_FRACTION = 0.005

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Eases the chart's y-axis scale to `target`, so the trace stretches or
 * squashes smoothly instead of jumping when the scale steps. It snaps under
 * reduced motion.
 */
export function useSmoothScale(target: number): number {
  const [easedScale, setEasedScale] = useState(target)
  const easedScaleRef = useRef(target)

  useEffect(() => {
    const easeMs = target > easedScaleRef.current ? EASE_UP_MS : EASE_DOWN_MS
    let lastFrameTime = performance.now()
    let frameId = 0
    const step = (now: number): void => {
      const gap = target - easedScaleRef.current
      const shouldSnap =
        !Number.isFinite(gap) || Math.abs(gap) <= target * SETTLE_FRACTION || matchMedia(REDUCED_MOTION).matches
      if (shouldSnap) {
        easedScaleRef.current = target
        setEasedScale(target)
        return
      }
      // By time, not by frame, so a 120 Hz display eases at the same pace.
      const elapsed = Math.max(0, now - lastFrameTime)
      lastFrameTime = now
      easedScaleRef.current += gap * (1 - Math.exp(-elapsed / easeMs))
      setEasedScale(easedScaleRef.current)
      frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [target])

  return easedScale
}
