import { useContext } from 'react'
import type { NetworkState } from '@/features/connection/hooks/useNetworkInfoSource'
import { NetworkContext } from '@/app/context/network-context'

/** The local link: `info` (null until the first read), `error`, `lastReadAt`, `isLoading` and `refresh`. */
export function useNetwork(): NetworkState {
  const network = useContext(NetworkContext)
  if (!network) throw new Error('useNetwork must be used inside <NetworkProvider>')
  return network
}
