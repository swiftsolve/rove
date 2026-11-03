import { useEffect, useRef, useState } from 'react'

/** Fraction of the remaining gap closed per frame while easing down. */
const EASE_DOWN_FACTOR = 0.18
/** Mbps scale values are large; settle once within half a unit. */
const SETTLE_THRESHOLD_MBPS = 0.5

/**
 * Eases the chart's y-axis scale down over a few frames, so the trace doesn't
 * jump taller when a peak leaves the window. Scale-ups are instant, so a spike
 * is never clipped.
 */
export function useSmoothScale(target: number): number {
  const [value, setValue] = useState(target)
  const currentRef = useRef(target)

  useEffect(() => {
    if (target >= currentRef.current) {
      currentRef.current = target
      setValue(target)
      return
    }

    let frameId = 0
    const step = (): void => {
      const gap = target - currentRef.current
      if (Math.abs(gap) < SETTLE_THRESHOLD_MBPS) {
        currentRef.current = target
        setValue(target)
        return
      }
      currentRef.current += gap * EASE_DOWN_FACTOR
      setValue(currentRef.current)
      frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [target])

  return value
}
