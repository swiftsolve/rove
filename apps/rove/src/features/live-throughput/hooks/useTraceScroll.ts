import { useEffectEvent, useLayoutEffect, useRef } from 'react'

// A sample lands each second; each scroll runs a little longer, so a sample
// that's slightly late carries the scroll on instead of finding it stopped.
const SCROLL_MS = 1100
/** How far the scroll may fall behind (slots) before it skips ahead, as after a burst of samples. */
const MAX_LAG_SLOTS = 1

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Scrolls the chart's trace between samples, calling `drawFrame` with how far
 * it has scrolled since the newest sample landed, in slots: 0 to 1, or down
 * to -1 when a sample lands before the last scroll finished. Each new
 * `samples` array is a new sample. Under reduced motion it stays at 1, so the
 * trace steps instead of gliding.
 *
 * `drawFrame` moves the drawing itself, rather than this returning state:
 * a React render 60 times a second kept the page's process at a full core.
 * It's also called after every render, so a new scale or width redraws.
 */
export function useTraceScroll(samples: readonly number[], drawFrame: (progress: number) => void): void {
  const progressRef = useRef(1)
  const lastSamplesRef = useRef(samples)

  const draw = useEffectEvent((progress: number): void => {
    progressRef.current = progress
    drawFrame(progress)
  })

  useLayoutEffect(() => {
    drawFrame(progressRef.current)
  })

  useLayoutEffect(() => {
    const isNewSample = samples !== lastSamplesRef.current
    lastSamplesRef.current = samples
    if (samples.length === 0 || matchMedia(REDUCED_MOTION).matches) {
      draw(1)
      return
    }
    // A new sample shifts every point a slot left, so the scroll starts a slot
    // back to hold them still, then glides on. StrictMode's re-run isn't a new
    // sample, so it carries on where it was.
    const startProgress = isNewSample ? Math.max(progressRef.current - 1, -MAX_LAG_SLOTS) : progressRef.current
    draw(startProgress)
    if (startProgress >= 1) return

    const startTime = performance.now()
    let frameId = 0
    const step = (now: number): void => {
      const fractionDone = Math.min(1, Math.max(0, (now - startTime) / SCROLL_MS))
      draw(startProgress + (1 - startProgress) * fractionDone)
      if (fractionDone < 1) frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [samples])
}
