import { useEffect, useRef, useState } from 'react'

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

    let raf = 0
    const step = (): void => {
      const diff = target - currentRef.current
      // Mbps scale values are large; settle once within half a unit.
      if (Math.abs(diff) < 0.5) {
        currentRef.current = target
        setValue(target)
        return
      }
      currentRef.current += diff * 0.18
      setValue(currentRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return value
}
