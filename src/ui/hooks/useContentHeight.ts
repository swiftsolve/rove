import { useLayoutEffect, useState } from 'react'

/**
 * The height of `content`'s border box, kept current as it resizes, or null
 * until it's measured.
 *
 * Set it as the height of a wrapper that clips and transitions its height, and
 * the wrapper eases to fit whenever the content grows or shrinks. Until the
 * first measurement the wrapper's height is `auto`, which doesn't transition,
 * so the content opens at its size rather than growing from nothing.
 */
export function useContentHeight(content: HTMLElement | null): number | null {
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!content) return
    const measure = (): void => setHeight(content.getBoundingClientRect().height)
    measure()
    const resizes = new ResizeObserver(measure)
    resizes.observe(content)
    return () => resizes.disconnect()
  }, [content])

  return height
}
