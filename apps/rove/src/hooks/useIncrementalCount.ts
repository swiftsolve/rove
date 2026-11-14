import { useEffect, useState } from 'react'

/**
 * Long enough for a page's enter stagger to finish (`page` in utilities.css:
 * 220ms, the last child starting 180ms in) before the rest of the list renders.
 */
const SETTLE_MS = 420

/**
 * How many of a long list's `total` items to render. A few hundred rows can take
 * WebKitGTK longer to build than the page's whole enter animation, so the page
 * would appear already settled. This renders `initial` (enough to fill the
 * window) on mount, then adds `step` more each task once the page has settled,
 * so no single frame carries the whole list.
 */
export function useIncrementalCount(total: number, initial: number, step: number): number {
  const [count, setCount] = useState(initial)

  useEffect(() => {
    if (count >= total) return
    const timeoutId = window.setTimeout(
      () => setCount((current) => Math.min(total, current + step)),
      count === initial ? SETTLE_MS : 0,
    )
    return () => window.clearTimeout(timeoutId)
  }, [count, total, initial, step])

  return Math.min(count, total)
}
