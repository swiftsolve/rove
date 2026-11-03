import { useEffect, useState } from 'react'

/**
 * Whether the app window is visible (not minimised, occluded or asleep), so
 * polling can pause while it's hidden rather than stampede the backend when
 * the webview's throttled timers catch up.
 */
export function usePageVisible(): boolean {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    // Not focus/blur: those fire on every alt-tab while the window is still
    // visible, forcing a heavy rescan each time you click back.
    const update = () => setIsVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return isVisible
}
