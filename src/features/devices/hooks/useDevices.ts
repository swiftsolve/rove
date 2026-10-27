import type { LanDeviceScan, NetworkAPI } from '@/types'
import { useBackendQuery } from '@/hooks/useBackendQuery'
import { useSetting } from '@/hooks/useSetting'
import { IS_MAC } from '@/lib/platform'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetworkKey } from '@/app/hooks/useNetworkKey'
import { refreshNetworkEvents } from '@/features/events/hooks/useNetworkEvents'

interface UseDevicesResult {
  scan: LanDeviceScan | null
  isScanning: boolean
  error: string | null
  rescan: () => Promise<void>
}

async function scanDevices(api: NetworkAPI): Promise<LanDeviceScan> {
  try {
    return await api.getDevices()
  } finally {
    // A scan is what generates new events, so pull the feed the moment one
    // finishes rather than waiting on its poll.
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

  // Which screens scan when they open: Devices always, Home only when the
  // setting keeps its device count warm. On macOS, Home never auto-scans:
  // device discovery needs the Local Network permission, so we wait until the
  // user opens Devices or taps Discover on the Home card. Events never scans on
  // its own; it only shows the result and offers a rescan.
  const [isHomeDeviceScanEnabled] = useSetting('homeDeviceScan', true)
  const shouldScanOnOpen =
    location.tab === 'devices' || (location.tab === 'home' && !IS_MAC && isHomeDeviceScanEnabled)

  // No periodic poll: a LAN scan is heavy (ARP/SSDP/ping sweeps) and repeatedly
  // rescanning in the background is intrusive. Scan when a scanning screen
  // opens, when the network changes, or when the user hits refresh — nothing on
  // a timer. Moving between Home and Devices keeps the query open, so it
  // doesn't rescan.
  //
  // A genuine network switch is covered by the network key: when the interface
  // or IP changes, the key changes and the new network gets a fresh scan. We do
  // NOT rescan on every raw `network-changed` nudge: macOS' route-socket monitor
  // emits those for transient routing churn (including traffic from our own
  // scan), which turned into an endless self-triggering rescan loop.
  //
  // The scan waits for the network key, so it never starts against an unknown
  // network and then has to run again once the key is known.
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['devices', networkKey],
    queryFn: api ? () => scanDevices(api) : undefined,
    isEnabled: shouldScanOnOpen && networkKey != null,
    errorMessage: 'Failed to scan for devices',
  })

  return { scan: data ?? null, isScanning: isBusy, error, rescan: reload }
}
