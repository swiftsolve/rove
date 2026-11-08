import { useLayoutEffect, useRef, useState } from 'react'

// A sample lands each second; each scroll runs a little longer, so a sample
// that's slightly late carries the scroll on instead of finding it stopped.
const SCROLL_MS = 1100
/** How far the scroll may fall behind (slots) before it skips ahead, as after a burst of samples. */
const MAX_LAG_SLOTS = 1

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * How far the chart's trace has scrolled since its newest sample landed, in
 * slots: 0 to 1, or down to -1 when a sample lands before the last scroll
 * finished. Each new `samples` array is a new sample. Under reduced motion it
 * stays at 1, so the trace steps instead of gliding.
 */
export function useTraceScroll(samples: readonly number[]): number {
  const [progress, setProgress] = useState(1)
  const progressRef = useRef(1)
  const lastSamplesRef = useRef(samples)

  useLayoutEffect(() => {
    const isNewSample = samples !== lastSamplesRef.current
    lastSamplesRef.current = samples
    const updateProgress = (value: number): void => {
      progressRef.current = value
      setProgress(value)
    }
    if (samples.length === 0 || matchMedia(REDUCED_MOTION).matches) {
      updateProgress(1)
      return
    }
    // A new sample shifts every point a slot left, so the scroll starts a slot
    // back to hold them still, then glides on. StrictMode's re-run isn't a new
    // sample, so it carries on where it was.
    const from = isNewSample ? Math.max(progressRef.current - 1, -MAX_LAG_SLOTS) : progressRef.current
    updateProgress(from)
    if (from >= 1) return

    const start = performance.now()
    let frameId = 0
    const step = (now: number): void => {
      const fractionDone = Math.min(1, Math.max(0, (now - start) / SCROLL_MS))
      updateProgress(from + (1 - from) * fractionDone)
      if (fractionDone < 1) frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [samples])

  return progress
}
