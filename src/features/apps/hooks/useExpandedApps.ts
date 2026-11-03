import { useCallback, useState } from 'react'

/**
 * Which groups are expanded, by app name. Only `focusApp` starts open, so the
 * list stays scannable. The view remounts on each navigation, so seeding the
 * initial state is enough.
 */
export function useExpandedApps(focusApp: string | null | undefined): {
  isExpanded: (name: string) => boolean
  toggle: (name: string) => void
} {
  const [expanded, setExpanded] = useState<Set<string>>(() => (focusApp ? new Set([focusApp]) : new Set()))
  const isExpanded = (name: string): boolean => expanded.has(name)
  // Stable, so a memoised group re-renders only when its own app changes.
  const toggle = useCallback(
    (name: string): void =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      }),
    [],
  )
  return { isExpanded, toggle }
}
