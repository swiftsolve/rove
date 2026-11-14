import { useSetting } from '@/hooks/useSetting'

/** Its key before it became a setting; still read, so an open panel stays open. */
const LEGACY_KEY = 'rove.connection-details-expanded'

function wasExpandedBefore(): boolean {
  try {
    return localStorage.getItem(LEGACY_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Remembers whether the details are open. A setting, so the choice survives
 * tab switches (which unmount the card) and restarts, and every window agrees.
 */
export function useDetailsExpanded(): [boolean, () => void] {
  const [isExpanded, setIsExpanded] = useSetting('connectionDetailsExpanded', wasExpandedBefore())
  return [isExpanded, () => setIsExpanded(!isExpanded)]
}
