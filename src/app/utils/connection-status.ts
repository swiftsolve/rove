import type { InternetStatus, NetworkInfo } from '@/types'
import { isConnectedNetwork, isInternetDown } from '@/types'
import { formatConnectionType } from '@/utils/format'

/**
 * The title bar's connectivity tone. `positive`: a link that reaches the
 * internet. `negative`: a link is up but the public internet isn't (an ISP
 * outage, or a bridge with no WAN route). `neutral`: connecting, or no link.
 */
export type StatusTone = 'positive' | 'negative' | 'neutral'

export type ConnectionStatus = {
  tone: StatusTone
  /** The title bar's label: "Wi-Fi", "No internet", "Offline", … */
  label: string
  /**
   * The same verdict as an InternetStatus, for the Services headers: one
   * source, so the page can't say "No internet" while the bar says Wi-Fi (or
   * the reverse) between probe batches. Undefined while still connecting.
   */
  internet: InternetStatus | undefined
}

/**
 * Layer WAN reachability over the local link: a live link with a dead WAN reads
 * "No internet" rather than connected. `internet` is null until the first
 * heartbeat lands; that reads as fine, so launch doesn't flash a false outage.
 */
export function describeConnectionStatus(info: NetworkInfo | null, internet: InternetStatus | null): ConnectionStatus {
  if (!info) return { tone: 'neutral', label: 'Connecting…', internet: undefined }
  if (!isConnectedNetwork(info)) return { tone: 'neutral', label: 'Offline', internet: 'offline' }

  if (internet != null && isInternetDown(internet)) return { tone: 'negative', label: 'No internet', internet }

  return { tone: 'positive', label: formatConnectionType(info.connectionType), internet: 'online' }
}
