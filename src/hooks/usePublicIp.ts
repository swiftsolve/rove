import { useMemo, useRef } from 'react'
import { useBackendResource } from '@/hooks/useBackendResource'

interface PublicIpState {
  readonly publicIp: string | null
  readonly isLoading: boolean
}

/**
 * Fetches the machine's public (WAN) IP address. Re-runs whenever `refetchKey`
 * changes (e.g. the local IP), since switching networks can change the WAN IP.
 */
export function usePublicIp(enabled: boolean, refetchKey: string | null): PublicIpState {
  const api = window.networkAPI
  const fetchIp = useMemo(
    () => (api?.getPublicIp ? () => api.getPublicIp() : undefined),
    [api],
  )

  const { data, isBusy } = useBackendResource(
    fetchIp,
    enabled,
    'Failed to fetch the public IP.',
    { refetchOnEnable: true, resetKey: refetchKey },
  )

  // Keep the last known value rather than flashing to "—" on a blip: a network
  // switch (resetKey change) or transient failure clears/keeps `data` null, but
  // the WAN IP rarely changes — show the previous one until the refetch lands.
  const lastIpRef = useRef<string | null>(null)
  if (data != null) lastIpRef.current = data

  return { publicIp: data ?? lastIpRef.current, isLoading: isBusy }
}
