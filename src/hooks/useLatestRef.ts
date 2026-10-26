import { useLayoutEffect, useRef, type MutableRefObject } from 'react'

/**
 * A ref that always holds the latest `value`, for callbacks, timers and frame
 * loops that must read fresh props without re-subscribing.
 *
 * The ref is written in a layout effect rather than during render, so a render
 * React throws away never leaks into it. Read it only outside render.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
