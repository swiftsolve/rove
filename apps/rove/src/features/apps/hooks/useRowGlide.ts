import { type RefObject, useLayoutEffect, useRef } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/**
 * Glides a list's rows to their new places when `order` changes, instead of
 * letting them jump: a busier app overtaking another slides past it. React
 * keeps each keyed row's element as it moves, so the row is its own identity.
 * Positions are measured every render, so a row that only shifted (an app
 * above expanding) doesn't glide, and the next reorder starts from where the
 * rows really were.
 */
export function useRowGlide(listRef: RefObject<HTMLElement | null>, order: string): void {
  const topsRef = useRef(new WeakMap<Element, number>())
  const orderRef = useRef(order)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const hasReordered = order !== orderRef.current
    orderRef.current = order
    const shouldGlide = hasReordered && !matchMedia(REDUCED_MOTION).matches
    // The theme's normal duration and ease-out, so the glide moves like the rest of the app.
    const theme = getComputedStyle(document.documentElement)
    const duration = Number.parseFloat(theme.getPropertyValue('--duration-normal')) || 0
    const easing = theme.getPropertyValue('--ease-out').trim() || 'ease-out'
    const listTop = list.getBoundingClientRect().top

    for (const row of list.children) {
      const top = row.getBoundingClientRect().top - listTop
      const previousTop = topsRef.current.get(row)
      topsRef.current.set(row, top)
      if (shouldGlide && previousTop !== undefined && Math.abs(previousTop - top) >= 1) {
        row.animate([{ transform: `translateY(${previousTop - top}px)` }, { transform: 'none' }], { duration, easing })
      }
    }
  })
}
