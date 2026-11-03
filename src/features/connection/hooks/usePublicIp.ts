import { useState } from 'react'

import { useBackendQuery } from '@/hooks/useBackendQuery'

type PublicIpState = {
  publicIp: string | null
  isLoading: boolean
}

/**
 * Fetches the machine's public (WAN) IP address. Keyed by the local IP, since
 * switching networks can change the WAN IP; refetched each time Home opens.
 */
export function usePublicIp(isEnabled: boolean, localIp: string | null): PublicIpState {
  const api = window.networkAPI
  const { data, isBusy } = useBackendQuery({
    queryKey: ['publicIp', localIp],
    queryFn: api ? () => api.getPublicIp() : undefined,
    isEnabled,
    errorMessage: 'Failed to fetch the public IP.',
  })

  // A new key or an empty lookup leaves `data` null; the WAN IP rarely changes,
  // so show the previous one rather than flash "—".
  const [lastIp, setLastIp] = useState<string | null>(null)
  if (data != null && data !== lastIp) setLastIp(data)

  return { publicIp: data ?? lastIp, isLoading: isBusy }
}
