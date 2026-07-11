import { useEffect, useRef } from 'react'

/**
 * Runs `callback` whenever the backend nudges us that the OS routing table
 * changed (cable pulled, Wi-Fi joined) — so data hooks can refresh at once
 * instead of waiting out their poll interval.
 *
 * The callback is kept in a ref, so callers may pass a fresh closure each
 * render without churning the subscription; only `enabled` re-subscribes.
 */
export function useOnNetworkChanged(callback: () => void, enabled = true): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return
    const api = window.networkAPI
    if (!api?.onNetworkChanged) return
    // The `active` flag guards against a nudge that races the detach: the
    // bridge's unsubscribe resolves asynchronously, so an event can still
    // arrive after cleanup started.
    let active = true
    const detach = api.onNetworkChanged(() => {
      if (active) callbackRef.current()
    })
    return () => {
      active = false
      detach()
    }
  }, [enabled])
}
