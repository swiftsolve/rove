import { type RefObject, useEffect, useRef } from 'react'

import { restoreReturnPoint, type ReturnPoint } from '@/app/utils/return-point'

/**
 * What happens on every screen change (tab or subpage): the scroll area returns
 * to the top, and focus moves to the new page's h1. Going back to a screen
 * instead lands on the control that opened the next one (`returnPoint`),
 * scrolled to where it was.
 *
 * `screenKey` identifies the current screen; attach the returned refs to the
 * scrolling container and the <main> region.
 */
export function useScreenFocus(
  screenKey: string,
  returnPoint: ReturnPoint | null,
): {
  scrollRef: RefObject<HTMLDivElement | null>
  mainRef: RefObject<HTMLElement | null>
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  // A new page never inherits the previous page's scroll position.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [screenKey])

  // Focus the new page's h1 (or <main>) so screen readers announce it and Tab
  // enters its content. Keyed on the last screen focused, not a first-run flag:
  // StrictMode's second mount run would otherwise pull focus into <main> at launch.
  const focusedKeyRef = useRef(screenKey)
  useEffect(() => {
    if (focusedKeyRef.current === screenKey) return
    focusedKeyRef.current = screenKey
    const main = mainRef.current
    if (!main) return
    // Runs after the scroll reset above, so it can scroll back down.
    const scroller = scrollRef.current
    if (returnPoint && scroller && restoreReturnPoint(main, scroller, returnPoint)) return
    const target = main.querySelector<HTMLElement>('h1') ?? main
    target.tabIndex = -1
    target.focus({ preventScroll: true })
  }, [screenKey, returnPoint])

  return { scrollRef, mainRef }
}
