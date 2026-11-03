import { useState } from 'react'

const EXPANDED_KEY = 'rove.connection-details-expanded'

/** Remembers whether the details are open. Persisted so the choice survives
 *  tab switches (which unmount the card) and restarts; defaults to collapsed. */
export function useDetailsExpanded(): [boolean, () => void] {
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleExpanded = (): void => {
    setIsExpanded((wasExpanded) => {
      const willExpand = !wasExpanded
      try {
        localStorage.setItem(EXPANDED_KEY, String(willExpand))
      } catch {
        // Storage unavailable: remember for this session only.
      }
      return willExpand
    })
  }

  return [isExpanded, toggleExpanded]
}
