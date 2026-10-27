import { useContext } from 'react'
import type { InternetStatus } from '@/types'
import { InternetStatusContext } from '@/app/context/internet-status-context'

/** Whether the public internet is reachable, from the backend heartbeat. Null until the first verdict. */
export function useInternetStatus(): InternetStatus | null {
  const internet = useContext(InternetStatusContext)
  if (internet === undefined) throw new Error('useInternetStatus must be used inside <NetworkProvider>')
  return internet
}
