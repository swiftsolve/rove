import { useEffect, useEffectEvent } from 'react'

/**
 * Runs `callback` whenever the backend nudges us that the OS routing table
 * changed (cable pulled, Wi-Fi joined) — so data hooks can refresh at once
 * instead of waiting out their poll interval.
 *
 * The callback is an effect event, so callers may pass a fresh closure each
 * render without churning the subscription; only `isEnabled` re-subscribes.
 */
export function useOnNetworkChanged(callback: () => void, isEnabled = true): void {
  const onChanged = useEffectEvent(callback)

  useEffect(() => {
    if (!isEnabled) return
    const api = window.networkAPI
    if (!api?.onNetworkChanged) return
    // The `isActive` flag guards against a nudge that races the detach: the
    // bridge's unsubscribe resolves asynchronously, so an event can still
    // arrive after cleanup started.
    let isActive = true
    const detach = api.onNetworkChanged(() => {
      if (isActive) onChanged()
    })
    return () => {
      isActive = false
      detach()
    }
  }, [isEnabled])
}
