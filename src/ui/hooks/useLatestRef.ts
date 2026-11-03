import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * A ref that always holds the latest `value`, for callbacks that must read
 * fresh props without re-subscribing. Read only from an effect? Use React's
 * `useEffectEvent` instead; this is for code that runs outside effects too.
 *
 * The ref is written in a layout effect rather than during render, so a render
 * React throws away never leaks into it. Read it only outside render.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
