import { use } from 'react'

import { ConnectionStatusContext } from '@/app/context/connection-status-context'
import type { ConnectionStatus } from '@/app/utils/connection-status'

/** The title bar's verdict (`tone`, `label`, `internet`), made from network info and internet status. */
export function useConnectionStatus(): ConnectionStatus {
  const connection = use(ConnectionStatusContext)
  if (!connection) throw new Error('useConnectionStatus must be used inside <NetworkProvider>')
  return connection
}
