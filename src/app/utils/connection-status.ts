import type { InternetStatus, NetworkInfo } from '@/types'
import { isConnectedNetwork } from '@/types'
import { formatConnectionType } from '@/lib/format'

// Top-bar connectivity state. 'positive' = a link that reaches the internet; 'negative' =
// a link is up but the public internet is unreachable (ISP outage, or a bridge
// with no WAN route); 'neutral' = connecting, or no usable link at all.
export type StatusTone = 'positive' | 'negative' | 'neutral'

export type ConnectionStatus = {
  tone: StatusTone
  /** The title bar's label: "Wi-Fi", "No internet", "Offline", … */
  label: string
  /**
   * The same verdict as an InternetStatus, for the Services headers — one
   * source of truth, so the page can't say "No internet" while the bar says
   * Wi-Fi (or the reverse) between service probe batches. Undefined while
   * still connecting.
   */
  internet: InternetStatus | undefined
}

/**
 * Layer WAN reachability over the local link: a live link with a dead WAN reads
 * "No internet" (red) rather than masquerading as connected; only a link that
 * reaches the internet is "on". `internet` is null until the first heartbeat
 * lands — treat that as fine so the bar doesn't flash a false outage on launch.
 */
export function describeConnectionStatus(info: NetworkInfo | null, internet: InternetStatus | null): ConnectionStatus {
  if (!info) return { tone: 'neutral', label: 'Connecting…', internet: undefined }
  if (!isConnectedNetwork(info)) return { tone: 'neutral', label: 'Offline', internet: 'offline' }

  const isInternetDown = internet === 'noInternet' || internet === 'offline'
  if (isInternetDown) return { tone: 'negative', label: 'No internet', internet }

  return { tone: 'positive', label: formatConnectionType(info.connectionType), internet: 'online' }
}
