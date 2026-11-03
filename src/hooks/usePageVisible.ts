import { useEffect, useState } from 'react'

/**
 * Whether the app window is visible (not minimised, occluded or asleep).
 *
 * Polls pause while hidden and read once on resume, rather than letting the
 * webview's throttled timers stampede the backend. A `setTimeout` frozen while
 * hidden fires the instant the app returns, so a poll's timeout that spans a
 * hidden stretch is discarded rather than read as a spurious "timed out".
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
