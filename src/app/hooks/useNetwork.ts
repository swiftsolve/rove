import { use } from 'react'

import { NetworkContext } from '@/app/context/network-context'
import type { NetworkState } from '@/features/connection/hooks/useNetworkInfoSource'

/** The local link: `info` (null until the first read), `error`, `lastReadAt`, `isLoading` and `refresh`. */
export function useNetwork(): NetworkState {
  const network = use(NetworkContext)
  if (!network) throw new Error('useNetwork must be used inside <NetworkProvider>')
  return network
}
