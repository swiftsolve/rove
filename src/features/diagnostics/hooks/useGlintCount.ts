import { useEffect, useState } from 'react'

// Often enough that a glance at the card catches one, rarely enough to stay
// in the background.
const GLINT_INTERVAL_MS = 15_000

/**
 * How many glints have come due since mount: one every 15 seconds, and one
 * for each finished check. A check restarts the clock, so a timed glint
 * never lands just after a check's.
 */
export function useGlintCount(finishedCheckCount: number): number {
  const [tickCount, setTickCount] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTickCount((count) => count + 1), GLINT_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [finishedCheckCount])
  return tickCount + finishedCheckCount
}
