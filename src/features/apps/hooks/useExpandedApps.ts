import { useCallback, useState } from 'react'

/** Which groups are expanded, by app name. Arriving via an app click opens that
 *  one; arriving via "All hosts" opens none, leaving the list scannable rather
 *  than dumping every host at once. Either way groups that appear on a later
 *  poll stay collapsed. The view remounts on each navigation, so seeding from
 *  `focusApp` here is enough. */
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
