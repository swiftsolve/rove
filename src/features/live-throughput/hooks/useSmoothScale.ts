import { useEffect, useRef, useState } from 'react'

/** Fraction of the remaining gap closed per frame while easing down. */
const EASE_DOWN_FACTOR = 0.18
/** Mbps scale values are large; settle once within half a unit. */
const SETTLE_THRESHOLD_MBPS = 0.5

/**
 * Smooths the chart's y-axis scale so it glides toward a smaller target instead
 * of snapping. Scale-ups are applied instantly — that keeps a sudden spike from
 * being clipped and avoids any lag on the way up — while scale-downs ease over a
 * few frames, which is the jarring direction (the trace would otherwise jump
 * taller all at once when the recent peak finally drops out of the window).
 */
export function useSmoothScale(target: number): number {
  const [value, setValue] = useState(target)
  const currentRef = useRef(target)

  useEffect(() => {
    // Grow immediately: never clip a live spike or trail the data on the way up.
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
