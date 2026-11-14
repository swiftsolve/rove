import { useEffect, useState } from 'react'

/**
 * The time of the latest once-a-second tick, in epoch milliseconds, standing
 * in for a live feed's sample timestamps in a story: `LiveBadge`'s
 * `updatedAt`, a `live` StatusDot's `key`.
 */
export function useSecondTicks(): number {
  const [tickedAt, setTickedAt] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setTickedAt(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return tickedAt
}
