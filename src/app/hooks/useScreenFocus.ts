import { useEffect, useRef, type RefObject } from 'react'

/**
 * What happens on every screen change (tab or subpage): the scroll area returns
 * to the top, and focus moves to the new page's h1.
 *
 * `screenKey` identifies the current screen; attach the returned refs to the
 * scrolling container and the <main> region.
 */
export function useScreenFocus(screenKey: string): {
  scrollRef: RefObject<HTMLDivElement>
  mainRef: RefObject<HTMLElement>
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  // A new page never inherits the previous page's scroll position.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [screenKey])

  // On every screen change after the first, move focus to the new page's h1 (or
  // the main region if the page has none yet, e.g. still loading). This is the
  // standard SPA route-change pattern: screen readers announce the new page, and
  // the next Tab enters its content instead of walking the rest of the nav rail.
  // Compared against the last screen focused rather than a first-run flag:
  // StrictMode runs this twice on mount, and a flag spent on the first run
  // would let the second pull focus into <main> at launch, so Tab skipped the
  // rail and Shift+Tab landed on Settings.
  const focusedKeyRef = useRef(screenKey)
  useEffect(() => {
    if (focusedKeyRef.current === screenKey) return
    focusedKeyRef.current = screenKey
    const main = mainRef.current
    if (!main) return
    const target = main.querySelector<HTMLElement>('h1') ?? main
    target.tabIndex = -1
    target.focus({ preventScroll: true })
  }, [screenKey])

  return { scrollRef, mainRef }
}
