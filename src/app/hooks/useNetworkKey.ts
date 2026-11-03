import { useNetwork } from '@/app/hooks/useNetwork'

/**
 * The current network's identity, interface plus IP, for query keys: a new
 * network gets its own cache entry, so the previous network's results never
 * show. Null until network info is known.
 *
 * Network-keyed queries (devices, diagnostics, services) stay disabled while
 * it's null. They used to start fetching before network info landed and then
 * adopt the key quietly; with the key in the query key, that would fetch twice,
 * so they wait for the network's identity instead.
 */
export function useNetworkKey(): string | null {
  const { info } = useNetwork()
  return info ? `${info.interfaceName}|${info.ipAddress ?? ''}` : null
}
