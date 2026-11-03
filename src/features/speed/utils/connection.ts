import type { SpeedTestConnection } from '@/features/speed/types'
import { formatBand } from '@/lib/format'
import { isWifiNetwork, type NetworkInfo, type SpeedRunContext } from '@/types'

/** The medium a speed test ran over; `unknown` for anything else a result recorded. */
export type ConnectionKind = SpeedTestConnection['type'] | 'unknown'

// Shown in place of a network name the result doesn't have.
const FALLBACK_NAMES: Record<ConnectionKind, string> = { wifi: 'Wi‑Fi', ethernet: 'Ethernet', unknown: 'Unknown' }

/** The medium a recorded connection type names. */
export function connectionKind(connectionType: string): ConnectionKind {
  return connectionType === 'wifi' || connectionType === 'ethernet' ? connectionType : 'unknown'
}

/** What to call a connection: its network name, else its medium. */
export function connectionName(kind: ConnectionKind, networkName: string | null): string {
  return networkName ?? FALLBACK_NAMES[kind]
}

/** The connection a finished run recorded, or null when it wasn't Wi-Fi or Ethernet. */
export function connectionFromContext(context: SpeedRunContext): SpeedTestConnection | null {
  if (context.connectionType === 'wifi') {
    return { type: 'wifi', name: context.networkName, band: formatBand(context.frequency) }
  }
  if (context.connectionType === 'ethernet') {
    return { type: 'ethernet', name: null, band: null }
  }
  return null
}

/** The live connection, for the card before any test has run, or null when it isn't Wi-Fi or Ethernet. */
export function connectionFromNetworkInfo(info: NetworkInfo | null): SpeedTestConnection | null {
  if (!info) return null
  if (isWifiNetwork(info)) {
    return { type: 'wifi', name: info.ssid ?? null, band: formatBand(info.frequency) }
  }
  if (info.connectionType === 'ethernet') {
    return { type: 'ethernet', name: null, band: null }
  }
  return null
}
