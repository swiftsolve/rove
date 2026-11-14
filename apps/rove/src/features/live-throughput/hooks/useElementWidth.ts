import { useLayoutEffect, useState } from 'react'

/** The width of `element`'s content box, kept current as it resizes, or null until it's measured. */
export function useElementWidth(element: HTMLElement | null): number | null {
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!element) return
    const measure = (): void => setWidth(element.clientWidth)
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [element])

  return width
}
