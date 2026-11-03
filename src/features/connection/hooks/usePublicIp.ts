import { useState } from 'react'

import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { useBackendQuery } from '@/hooks/useBackendQuery'

type PublicIpState = {
  publicIp: string | null
  isLoading: boolean
}

/**
 * Fetches the machine's public (WAN) IP address. Keyed by the network, since
 * switching networks can change the WAN IP; refetched each time Home opens.
 */
export function usePublicIp(isEnabled: boolean): PublicIpState {
  const api = window.networkAPI
  const networkKey = useNetworkKey()
  const { data, isBusy } = useBackendQuery({
    queryKey: ['publicIp', networkKey],
    queryFn: api ? () => api.getPublicIp() : undefined,
    isEnabled: isEnabled && networkKey != null,
    errorMessage: 'Failed to fetch the public IP.',
  })

  // A refetch or an empty lookup leaves `data` null; the WAN IP rarely changes,
  // so show this network's previous one rather than flash "—". Never another
  // network's: that would be wrong data, not stale data.
  const [last, setLast] = useState<{ networkKey: string | null; ip: string } | null>(null)
  if (data != null && (data !== last?.ip || networkKey !== last.networkKey)) setLast({ networkKey, ip: data })
  const lastIp = last?.networkKey === networkKey ? last.ip : null

  return { publicIp: data ?? lastIp, isLoading: isBusy }
}
