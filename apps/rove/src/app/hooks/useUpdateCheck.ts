import { useEffect, useState } from 'react'

import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'
import { getSetting } from '@/hooks/useSetting'

/** One check per launch, shared: StrictMode's dev remount runs the effect twice. */
let launchCheck: Promise<PendingUpdate | null> | null = null

/**
 * Check for a newer signed release once, at launch, unless the user has
 * turned off automatic checks in Settings. Returns the update found (or null)
 * and a way to dismiss it. A dismissed update stays returned, so the dialog
 * keeps its content while it leaves.
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
    launchCheck ??= checkForUpdates().catch((err: unknown) => {
      console.warn('Update check failed:', err)
      return null
    })
    let isActive = true
    void launchCheck.then((update) => {
      if (isActive) setPendingUpdate(update)
    })
    return () => {
      isActive = false
    }
  }, [])

  return { pendingUpdate, isDismissed, dismissUpdate: () => setIsDismissed(true) }
}
