import { use } from 'react'

import { InternetStatusContext } from '@/app/context/internet-status-context'
import type { InternetStatus } from '@/types'

/** Whether the public internet is reachable, from the backend heartbeat. Null until the first verdict. */
export function useInternetStatus(): InternetStatus | null {
  const internet = use(InternetStatusContext)
  if (internet === undefined) throw new Error('useInternetStatus must be used inside <NetworkProvider>')
  return internet
}
