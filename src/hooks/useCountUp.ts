import { useEffect, useRef, useState } from 'react'

/**
 * Eases a displayed number toward `target` each animation frame, so the value
 * visibly counts up or down instead of snapping. Used for the speed-test cells
 * and the live-traffic readouts.
 */
export function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  const currentRef = useRef(target)

  useEffect(() => {
    let raf = 0
    const step = (): void => {
      const diff = target - currentRef.current
      if (Math.abs(diff) < 0.05) {
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
