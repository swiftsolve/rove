import { useState } from 'react'
import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'

/** Where a check the user asked for stands. */
export type UpdateCheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: PendingUpdate }

interface ManualUpdateCheck {
  check: UpdateCheckState
  /** Check now. A failed check reads as up to date, as `checkForUpdates` reports it. */
  runCheck: () => Promise<void>
}

/**
 * Settings' "Check now": idle until pressed, checking while it runs, then up
 * to date or the update found. The check at launch is `useUpdateCheck`'s.
 */
export function useManualUpdateCheck(): ManualUpdateCheck {
  const [check, setCheck] = useState<UpdateCheckState>({ kind: 'idle' })

  const runCheck = async (): Promise<void> => {
    setCheck({ kind: 'checking' })
    const update = await checkForUpdates()
    setCheck(update ? { kind: 'available', update } : { kind: 'up-to-date' })
  }

  return { check, runCheck }
}
