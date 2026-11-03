import { type RefObject, useEffect, useRef } from 'react'

import { scrollToTopAndFlash } from '@/lib/highlight'
import type { AppHosts } from '@/types'

/** Scrolls the focused app's group to the top once its data lands, then never
 *  again, so later polls don't yank the scroll. Deferred a task to land after the
 *  shell's scroll-to-top on navigation. Returns the ref to attach to the list. */
export function useScrollToFocusedApp(
  focusApp: string | null | undefined,
  apps: AppHosts[],
): RefObject<HTMLUListElement | null> {
  const listRef = useRef<HTMLUListElement>(null)
  const hasScrolledRef = useRef(false)
  useEffect(() => {
    if (!focusApp || hasScrolledRef.current) return
    const group = listRef.current?.querySelector<HTMLElement>(`[data-app="${CSS.escape(focusApp)}"]`)
    if (!group) return // Not loaded yet; a later poll re-runs this.
    const timeoutId = setTimeout(() => {
      if (scrollToTopAndFlash(group)) hasScrolledRef.current = true
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [focusApp, apps])
  return listRef
}
