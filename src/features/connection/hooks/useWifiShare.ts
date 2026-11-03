import { getNetworkApi } from '@/bridge/network-api'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { WifiShare } from '@/types'

type WifiShareQuery = {
  share: WifiShare | null
  /** The backend's error text, which the dialog words its notice from. */
  error: string | null
  isLoading: boolean
  /** Read it again: the dialog's Try again. */
  retry: () => void
}

/**
 * The current Wi-Fi network as a QR code, read each time the share dialog opens.
 * Nothing retries on its own, since the read can raise an OS auth prompt. Holds
 * the passphrase, so it's dropped from the cache when the dialog closes.
 */
export function useWifiShare(): WifiShareQuery {
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['connection', 'wifi-share'],
    queryFn: () => getNetworkApi().getWifiShare(),
    isEnabled: true,
    errorMessage: 'Could not read the Wi‑Fi network.',
    shouldForgetWhenClosed: true,
  })
  return { share: data ?? null, error, isLoading: isBusy, retry: () => void reload() }
}
