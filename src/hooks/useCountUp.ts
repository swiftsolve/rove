import { useEffect, useRef, useState } from 'react'

/** Fraction of the remaining distance covered each frame: the ease's speed. */
const EASE_FACTOR = 0.18
/** Closer than this, the value snaps onto the target and the loop stops. */
const SNAP_THRESHOLD = 0.05

/**
 * Eases a displayed number toward `target` each animation frame, so the value
 * visibly counts up or down instead of snapping. Used for the speed-test cells
 * and the live-traffic readouts.
 */
export function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  const currentRef = useRef(target)

  useEffect(() => {
    let frameId = 0
    const step = (): void => {
      const remaining = target - currentRef.current
      if (Math.abs(remaining) < SNAP_THRESHOLD) {
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
