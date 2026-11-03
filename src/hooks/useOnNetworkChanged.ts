import { useEffect, useEffectEvent } from 'react'

/**
 * Runs `callback` when the OS routing table changes (cable pulled, Wi-Fi
 * joined), so data hooks refresh without waiting for their next poll.
 * Only `isEnabled` re-subscribes; the callback may be a fresh closure each render.
 */
export function useOnNetworkChanged(callback: () => void, isEnabled = true): void {
  const onChanged = useEffectEvent(callback)

  useEffect(() => {
    if (!isEnabled) return
    const api = window.networkAPI
    if (!api?.onNetworkChanged) return
    // The bridge's unsubscribe is async, so an event can still arrive after cleanup.
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
