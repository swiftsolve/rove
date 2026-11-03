import { useEffect, useRef, useState } from 'react'

/** Fraction of the remaining distance covered each frame: the ease's speed. */
const EASE_FACTOR = 0.18
/** Closer than this, the value snaps onto the target and the loop stops. */
const SNAP_THRESHOLD = 0.05

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Eases a displayed number toward `target` each animation frame, so the value
 * visibly counts up or down instead of snapping. It snaps under reduced motion
 * (the global rule stops only CSS animations, not this one), and to or from a
 * value that isn't finite, which no ease could reach.
 */
export function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  const currentRef = useRef(target)

  useEffect(() => {
    let frameId = 0
    const step = (): void => {
      const remaining = target - currentRef.current
      // A NaN or infinite gap never closes, so without the snap one bad reading
      // would leave NaN on screen and the loop running every frame.
      const shouldSnap =
        !Number.isFinite(remaining) || Math.abs(remaining) < SNAP_THRESHOLD || matchMedia(REDUCED_MOTION).matches
      if (shouldSnap) {
        currentRef.current = target
        setValue(target)
        return
      }
      currentRef.current += remaining * EASE_FACTOR
      setValue(currentRef.current)
      frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [target])

  return value
}
