import { useEffect, useState } from 'react'

import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'
import { getSetting } from '@/hooks/useSetting'

/**
 * How often a running Rove checks again. It closes to the tray and can run for
 * days, so a check at launch alone would never hear of a release.
 */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** One check per launch, shared: StrictMode's dev remount runs the effect twice. */
let launchCheck: Promise<PendingUpdate | null> | null = null

/** Check, unless the user has turned off automatic checks in Settings. A failed check stays quiet: Settings' "Check now" reports one. */
async function checkIfAllowed(): Promise<PendingUpdate | null> {
  if (!getSetting('autoUpdate', true)) return null
  try {
    return await checkForUpdates()
  } catch (err: unknown) {
    console.warn('Update check failed:', err)
    return null
  }
}

/**
 * Check for a newer signed release at launch and every few hours after,
 * unless the user has turned off automatic checks in Settings. Returns the
 * update found (or null) and a way to dismiss it. A dismissed update stays
 * returned, so the dialog keeps its content while it leaves; it comes back
 * only for a newer version, or at the next launch.
 */
export function useUpdateCheck(): {
  pendingUpdate: PendingUpdate | null
  isDismissed: boolean
  dismissUpdate: () => void
} {
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true
    function showUpdate(update: PendingUpdate | null): void {
      // Keep the one already shown when a later check finds nothing new.
      if (isActive && update) setPendingUpdate(update)
    }

    launchCheck ??= checkIfAllowed()
    void launchCheck.then(showUpdate)
    const intervalId = window.setInterval(() => {
      void checkIfAllowed().then(showUpdate)
    }, UPDATE_CHECK_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  const isDismissed = pendingUpdate !== null && pendingUpdate.version === dismissedVersion
  function dismissUpdate(): void {
    if (pendingUpdate) setDismissedVersion(pendingUpdate.version)
  }

  return { pendingUpdate, isDismissed, dismissUpdate }
}
