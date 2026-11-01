import { useEffect, useState } from 'react'

/**
 * Whether an element that animates out should still be mounted.
 *
 * Rendering `{isActive && <X />}` drops the element the moment `isActive` turns
 * false, so a leave animation never gets to play. Render `<X />` while this
 * returns true instead, and style it as leaving while `isActive` is false: it
 * mounts as soon as `isActive` turns true and unmounts `exitMs` after it turns
 * false, which should match the length of the leave animation. Turning active
 * again before then cancels the unmount.
 */
export function usePresence(isActive: boolean, exitMs: number): boolean {
  const [isMounted, setIsMounted] = useState(isActive)
  if (isActive && !isMounted) setIsMounted(true)

  useEffect(() => {
    if (isActive) return
    const timeoutId = window.setTimeout(() => setIsMounted(false), exitMs)
    return () => window.clearTimeout(timeoutId)
  }, [isActive, exitMs])

  return isMounted
}
