import { useEffect, useState } from 'react'

/**
 * Tracks whether the app window is currently visible (i.e. not minimised,
 * fully occluded, or otherwise backgrounded by the OS).
 *
 * Polling hooks use this to **pause while hidden** and fire a single fresh read
 * **on resume**, instead of letting the webview's throttled timers wake up and
 * stampede the backend with a burst of stale requests. It also lets a poll's
 * timeout be discarded when it spans a hidden stretch: a `setTimeout` frozen for
 * minutes in the background fires the instant the app returns, which would
 * otherwise read as a spurious "timed out" even though the backend is fine.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    // Only `visibilitychange` — it flips to hidden on minimise, full occlusion
    // and system sleep, which is exactly the "backgrounded for a while" case.
    // Deliberately NOT focus/blur: those fire on every alt-tab while the window
    // is still visible, which would pause polling and force a heavy rescan each
    // time you click back.
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return visible
}
