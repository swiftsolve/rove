import type { InternetStatus, NetworkInfo, SpeedHistoryEntry } from '@/types'
import { isEthernetNetwork, isInternetDown, isWifiNetwork } from '@/types'

/**
 * The internet link on the Path card: down when the internet is unreachable,
 * untested when this network has no speed test yet, else healthy.
 */
export type InternetLinkState = 'offline' | 'notTested' | 'healthy'

/**
 * The newest speed test run on the network this machine is on now: the same
 * SSID on Wi‑Fi, any wired test on Ethernet. History is newest first.
 */
export function lastTestOnNetwork(
  entries: readonly SpeedHistoryEntry[] | undefined,
  info: NetworkInfo | null,
): SpeedHistoryEntry | null {
  if (!entries || !info) return null
  if (isWifiNetwork(info)) {
    return entries.find((entry) => entry.connectionType === 'wifi' && entry.networkName === info.ssid) ?? null
  }
  if (isEthernetNetwork(info)) return entries.find((entry) => entry.connectionType === 'ethernet') ?? null
  return null
}

/** Unknown internet status counts as up, so nothing reads as down before the first check. */
export function internetLinkState(
  internet: InternetStatus | undefined,
  lastTest: SpeedHistoryEntry | null,
): InternetLinkState {
  if (isInternetDown(internet)) return 'offline'
  return lastTest ? 'healthy' : 'notTested'
}
