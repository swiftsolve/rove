import { useEffect, useState } from 'react'
import { getSetting } from '@/hooks/useSetting'
import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'

/**
 * Check for a newer signed release once, shortly after launch — unless the
 * user has turned off automatic checks in Settings. Returns the update found
 * (or null) and a way to dismiss it.
 */
export function useUpdateCheck(): {
  pendingUpdate: PendingUpdate | null
  dismissUpdate: () => void
} {
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)

  useEffect(() => {
    if (!getSetting('autoUpdate', true)) return
    void checkForUpdates().then(setPendingUpdate)
  }, [])

  return { pendingUpdate, dismissUpdate: () => setPendingUpdate(null) }
}
