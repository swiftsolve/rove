import { useNetwork } from '@/app/hooks/useNetwork'

/**
 * The current network's identity, interface plus IP, for query keys, so the
 * previous network's results never show. Null until network info is known:
 * keyed queries stay disabled until then, or they'd fetch twice.
 */
export function useNetworkKey(): string | null {
  const { info } = useNetwork()
  return info ? `${info.interfaceName}|${info.ipAddress ?? ''}` : null
}
