import { useState } from 'react'

/**
 * How many times `value` has changed since mount: 0 at first, then one more on
 * each change. Keying an element on it replays an entry animation per change,
 * but not on the first render.
 */
export function useChangeCount(value: unknown): number {
  const [previous, setPrevious] = useState(value)
  const [count, setCount] = useState(0)
  // Adjusting state during render, React's pattern for reacting to a changed
  // prop without an effect and a second paint.
  if (!Object.is(previous, value)) {
    setPrevious(value)
    setCount(count + 1)
  }
  return count
}
