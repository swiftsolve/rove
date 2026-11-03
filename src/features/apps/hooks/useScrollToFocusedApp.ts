import { useEffect, useRef, type RefObject } from 'react'
import type { AppHosts } from '@/types'
import { flashHighlight } from '@/lib/highlight'

/** On arriving focused on an app, bring its group to the top of the list. Runs
 *  when the data arrives (it lands a poll or two after mount), then just once —
 *  later polls mustn't yank the scroll. Deferred a task so it lands *after* the
 *  app's scroll-to-top-on-navigation reset (a sibling effect that would
 *  otherwise clobber it). Scrolls the app's scroll container
 *  (`[data-scroll-root]`) directly rather than scrollIntoView, which walks up
 *  and scrolls every ancestor — reaching the host page when the app is
 *  embedded in an iframe (the marketing demo).
 *  Returns the ref to attach to the list. */
export function useScrollToFocusedApp(
  focusApp: string | null | undefined,
  apps: AppHosts[],
): RefObject<HTMLUListElement> {
  const listRef = useRef<HTMLUListElement>(null)
  const hasScrolledRef = useRef(false)
  useEffect(() => {
    if (!focusApp || hasScrolledRef.current) return
    const group = listRef.current?.querySelector<HTMLElement>(`[data-app="${CSS.escape(focusApp)}"]`)
    if (!group) return // data not in yet; a later poll re-runs this
    const timeoutId = setTimeout(() => {
      const scroller = group.closest<HTMLElement>('[data-scroll-root]')
      if (!scroller) return
      const margin = parseFloat(getComputedStyle(group).scrollMarginTop) || 0
      const delta = group.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTo({ top: scroller.scrollTop + delta - margin })
      flashHighlight(group)
      hasScrolledRef.current = true
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [focusApp, apps])
  return listRef
}
