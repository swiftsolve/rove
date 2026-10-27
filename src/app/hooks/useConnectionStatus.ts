import { useContext } from 'react'
import type { ConnectionStatus } from '@/app/utils/connection-status'
import { ConnectionStatusContext } from '@/app/context/connection-status-context'

/** The title bar's verdict (`tone`, `label`, `internet`), made from network info and internet status. */
export function useConnectionStatus(): ConnectionStatus {
  const connection = useContext(ConnectionStatusContext)
  if (!connection) throw new Error('useConnectionStatus must be used inside <NetworkProvider>')
  return connection
}
