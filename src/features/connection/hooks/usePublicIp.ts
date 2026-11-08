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
  const { data: fetchedIp, isBusy } = useBackendQuery({
    queryKey: ['publicIp', networkKey],
    queryFn: api ? () => api.getPublicIp() : undefined,
    isEnabled: isEnabled && networkKey != null,
    errorMessage: 'Failed to fetch the public IP.',
  })

  // A refetch or an empty lookup leaves `fetchedIp` null; the WAN IP rarely changes,
  // so show this network's previous one rather than drop the row. Never another
  // network's: that would be wrong data, not stale data.
  const [lastReading, setLastReading] = useState<{ networkKey: string | null; ip: string } | null>(null)
  const isNewReading = fetchedIp != null && (fetchedIp !== lastReading?.ip || networkKey !== lastReading.networkKey)
  if (isNewReading) setLastReading({ networkKey, ip: fetchedIp })
  const lastIp = lastReading?.networkKey === networkKey ? lastReading.ip : null

  return { publicIp: fetchedIp ?? lastIp, isLoading: isBusy }
}
