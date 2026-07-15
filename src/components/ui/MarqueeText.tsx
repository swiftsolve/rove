import { useEffect, useRef, useState, type CSSProperties } from 'react'
import './MarqueeText.css'

/**
 * Single-line text that truncates with an ellipsis and — only when it actually
 * overflows — marquees (scrolls to reveal the full string, then back) while
 * hovered. The overflow amount is measured, so text that fits never animates and
 * the scroll distance is exact; a `ResizeObserver` re-measures when the box
 * width changes. Scrolls via `text-indent`, so no wrapper element is needed and
 * the idle ellipsis is preserved.
 */
export function MarqueeText({
  text,
  className,
  title,
}: {
  readonly text: string
  readonly className?: string
  readonly title?: string
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Only measure while the text is at rest. An observer tick that lands while
    // the marquee is running rewrites `distance`, and that was observed to
    // cancel the animation mid-scroll and snap the text back to the first
    // character — the row is re-laid out around it as neighbouring readouts
    // settle (see `useCountUp`), so ticks do arrive during a hover. Scrolling
    // cannot change the text's own width, so a measurement taken now has nothing
    // to add; a genuine resize is picked up on the next tick, once the pointer
    // leaves and the animation stops.
    const measure = (): void => {
      if (el.getAnimations().length > 0) return
      setDistance(Math.max(0, el.scrollWidth - el.clientWidth))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  const overflowing = distance > 0
  // One cycle is a full round-trip (out, dwell, back, dwell), so the duration
  // scales with twice the travel. Each scroll leg is ~32% of the cycle; the
  // divisor keeps that leg near ~40px/s, and the floor stops a short overflow
  // from whipping past and keeps the end/start dwells noticeable.
  const style = overflowing
    ? ({
        '--marquee-distance': `${distance}px`,
        '--marquee-duration': `${Math.max(5, distance / 20 + 3)}s`,
      } as CSSProperties)
    : undefined

  return (
    <span
      ref={ref}
      className={['marquee-text', overflowing ? 'is-overflowing' : '', className]
        .filter(Boolean)
        .join(' ')}
      title={title}
      style={style}
    >
      {text}
    </span>
  )
}
