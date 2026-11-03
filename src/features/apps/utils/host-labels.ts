import { formatBytes } from '@/lib/format'

const LOCAL_PEER_LABEL = 'On your network'

/** Accessible name and tooltip for a host's icon: the country name when
 *  geolocated, a "local network" hint for a LAN peer, else nothing. */
export function hostIconLabel(flag: string | null, country: string | null, isLocal: boolean): string | null {
  if (flag && country) return country
  if (isLocal) return LOCAL_PEER_LABEL
  return null
}

/** An app group's header read out whole, e.g. "firefox, 5 hosts, 903 MB". */
export function appGroupLabel(name: string, hostCount: number, total: number): string {
  return `${name}, ${hostCount} ${hostCount === 1 ? 'host' : 'hosts'}, ${formatBytes(total)}`
}
