import { useEffect, useState } from 'react'

import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'
import { getSetting } from '@/hooks/useSetting'

/**
 * Check for a newer signed release once, shortly after launch — unless the
 * user has turned off automatic checks in Settings. Returns the update found
 * (or null) and a way to dismiss it. A dismissed update stays returned, so the
 * dialog keeps its content while it leaves.
 */
export function useUpdateCheck(): {
  pendingUpdate: PendingUpdate | null
  isDismissed: boolean
  dismissUpdate: () => void
} {
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    if (!getSetting('autoUpdate', true)) return
    // A failed check at launch stays quiet: Settings' "Check now" reports one.
    checkForUpdates().then(setPendingUpdate, (err: unknown) => console.warn('Update check failed:', err))
  }, [])

  return { pendingUpdate, isDismissed, dismissUpdate: () => setIsDismissed(true) }
}
