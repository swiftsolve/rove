import { useState } from 'react'

import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'

/** Where a check the user asked for stands. */
export type UpdateCheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: PendingUpdate }
  | { kind: 'failed' }

type ManualUpdateCheck = {
  check: UpdateCheckState
  /** Check now. Never rejects: a failed check ends as `failed`. */
  runCheck: () => Promise<void>
}

/**
 * Settings' "Check now": idle until pressed, checking while it runs, then up
 * to date, the update found, or failed (offline, or GitHub unreachable). The
 * automatic check, at launch and every few hours, is `useUpdateCheck`'s.
 */
export function useManualUpdateCheck(): ManualUpdateCheck {
  const [check, setCheck] = useState<UpdateCheckState>({ kind: 'idle' })

  const runCheck = async (): Promise<void> => {
    setCheck({ kind: 'checking' })
    try {
      const update = await checkForUpdates()
      setCheck(update ? { kind: 'available', update } : { kind: 'up-to-date' })
    } catch (err) {
      console.warn('Update check failed:', err)
      setCheck({ kind: 'failed' })
    }
  }

  return { check, runCheck }
}
