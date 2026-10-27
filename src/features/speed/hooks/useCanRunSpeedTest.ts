import { useAppData } from '@/app/hooks/useAppData'
import { canRunSpeedTest } from '@/features/connection/ConnectionCard'

/** Whether a speed test can start now: false while offline or before the
 *  first network read lands. */
export function useCanRunSpeedTest(): boolean {
  const { info } = useAppData().network
  return info != null && canRunSpeedTest(info)
}
