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

async function readWifiShare(): Promise<WifiShare> {
  try {
    return await getNetworkApi().getWifiShare()
  } catch (cause) {
    // Tauri rejects with the backend's plain string; keep its text, which says
    // why (not on Wi-Fi, name withheld), rather than a generic message.
    throw cause instanceof Error ? cause : new Error(String(cause))
  }
}

/**
 * The current Wi-Fi network as a QR code, read each time the share dialog
 * opens. Only Try again reads it again: reading the passphrase can raise an OS
 * auth prompt, so nothing retries on its own. The passphrase is in the result,
 * so it's dropped once the dialog closes rather than kept in the cache.
 */
export function useWifiShare(): WifiShareQuery {
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['connection', 'wifi-share'],
    queryFn: readWifiShare,
    isEnabled: true,
    errorMessage: 'Could not read the Wi‑Fi network.',
    shouldForgetWhenClosed: true,
  })
  return { share: data ?? null, error, isLoading: isBusy, retry: () => void reload() }
}
