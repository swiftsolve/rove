import { useEffect, useState } from 'react'

interface PublicIpState {
  readonly publicIp: string | null
  readonly isLoading: boolean
}

/**
 * Fetches the machine's public (WAN) IP address. Re-runs whenever `refetchKey`
 * changes (e.g. the local IP), since switching networks can change the WAN IP.
 */
export function usePublicIp(enabled: boolean, refetchKey: string | null): PublicIpState {
  const [state, setState] = useState<PublicIpState>({ publicIp: null, isLoading: false })

  useEffect(() => {
    if (!enabled || !window.networkAPI?.getPublicIp) {
      setState({ publicIp: null, isLoading: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ publicIp: prev.publicIp, isLoading: true }))

    window.networkAPI
      .getPublicIp()
      .then((ip) => {
        if (!cancelled) setState({ publicIp: ip, isLoading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ publicIp: null, isLoading: false })
      })

    return () => {
      cancelled = true
    }
  }, [enabled, refetchKey])

  return state
}
