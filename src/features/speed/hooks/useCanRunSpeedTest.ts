import { useNetwork } from '@/app/hooks/useNetwork'
import { isConnectedNetwork } from '@/types'

/**
 * Whether a speed test can start now: false while offline or before the
 * first network read lands.
 */
export function useCanRunSpeedTest(): boolean {
  const { info } = useNetwork()
  return info != null && isConnectedNetwork(info)
}
