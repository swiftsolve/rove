import { useLayoutEffect, useRef, useState } from 'react'

// The backend sends a sample a second. Each scroll is paced a little longer,
// so it settles about a tenth of a slot short and the next sample, a touch
// early or late, carries it on at the same speed instead of stopping it.
const SCROLL_MS = 1100
/** How far the scroll may fall behind (slots) before it skips ahead, as after a burst of samples. */
const MAX_LAG_SLOTS = 1

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * How far the chart's trace has scrolled, in slots, since its newest sample
 * landed: from 0, with the sample two before the newest on the right edge,
 * toward 1, with the one just before it there. A sample that lands before the
 * last scroll finished starts the next below 0, down to -1. The trace glides
 * instead of stepping. Each new `samples` array is a new sample. Under
 * reduced motion it stays at 1, so the trace steps.
 */
export function useTraceScroll(samples: readonly number[]): number {
  const [progress, setProgress] = useState(1)
  const progressRef = useRef(1)
  const lastSamplesRef = useRef(samples)

  useLayoutEffect(() => {
    const isNewSample = samples !== lastSamplesRef.current
    lastSamplesRef.current = samples
    const show = (value: number): void => {
      progressRef.current = value
      setProgress(value)
    }
    if (samples.length === 0 || matchMedia(REDUCED_MOTION).matches) {
      show(1)
      return
    }
    // A new sample moves every point a slot left in the layout, so the scroll
    // steps back a slot to hold them where they were, before the browser
    // paints. One that comes early keeps what's left of the last scroll,
    // which then runs a touch faster. StrictMode's second run isn't a new
    // sample, so it carries on as it was.
    const from = isNewSample ? Math.max(progressRef.current - 1, -MAX_LAG_SLOTS) : progressRef.current
    show(from)
    if (from >= 1) return

    const start = performance.now()
    let frameId = 0
    const step = (now: number): void => {
      const elapsed = Math.min(1, Math.max(0, (now - start) / SCROLL_MS))
      show(from + (1 - from) * elapsed)
      if (elapsed < 1) frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [samples])

  return progress
}
