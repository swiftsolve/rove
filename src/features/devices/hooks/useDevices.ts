import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { refreshNetworkEvents } from '@/features/events/hooks/useNetworkEvents'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import type { LanDeviceScan, NetworkAPI } from '@/types'
import { IS_MAC } from '@/utils/platform'

type UseDevicesResult = {
  /** Home scans on its own here; when it doesn't (macOS), its card offers Discover instead. */
  canHomeAutoScan: boolean
  lastScan: LanDeviceScan | null
  isScanning: boolean
  error: string | null
  rescan: () => Promise<void>
}

async function scanDevices(api: NetworkAPI): Promise<LanDeviceScan> {
  try {
    return await api.getDevices()
  } finally {
    // A scan generates events, so pull the feed now rather than wait for its poll.
    refreshNetworkEvents()
  }
}

/**
 * The LAN device scan, shared by every screen that shows it (Devices, the Home
 * card and Events) through one cache entry per network.
 */
export function useDevices(): UseDevicesResult {
  const api = window.networkAPI
  const { location } = useNavigation()
  const networkKey = useNetworkKey()

  // Home never auto-scans on macOS: discovery prompts for the Local Network
  // permission, which should follow the user opening Devices or tapping Discover.
  const canHomeAutoScan = !IS_MAC
  const shouldScanOnOpen = location.tab === 'devices' || (location.tab === 'home' && canHomeAutoScan)

  // No poll: a LAN scan (ARP/SSDP/ping sweeps) is too heavy to repeat in the
  // background. A network switch rescans through the key. Raw `network-changed`
  // nudges don't: macOS emits them for routing churn, our own scan included, which
  // made a self-triggering rescan loop.
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['devices', networkKey],
    queryFn: api ? () => scanDevices(api) : undefined,
    isEnabled: shouldScanOnOpen && networkKey != null,
    errorMessage: 'Couldn’t scan for devices',
  })

  return { canHomeAutoScan, lastScan: data ?? null, isScanning: isBusy, error, rescan: reload }
}
