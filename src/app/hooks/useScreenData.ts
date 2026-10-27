import type { InternetStatus, NetworkInfo } from '@/types'
import type { AppLocation } from '@/app/utils/location'
import { useSetting } from '@/hooks/useSetting'
import { IS_MAC } from '@/lib/platform'
import { useNetworkInterfaces } from '@/features/interfaces/hooks/useNetworkInterfaces'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { useNetworkEvents } from '@/features/events/hooks/useNetworkEvents'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { useAppUsage } from '@/features/apps/hooks/useAppUsage'
import { useHostUsage } from '@/features/apps/hooks/useHostUsage'
import { useTrafficUsage } from '@/features/apps/hooks/useTrafficUsage'
import { useDiagnostics } from '@/features/diagnostics/hooks/useDiagnostics'
import { useServiceReachability } from '@/features/services/hooks/useServiceReachability'

export interface ScreenData {
  interfaces: ReturnType<typeof useNetworkInterfaces>
  devices: ReturnType<typeof useDevices>
  events: ReturnType<typeof useNetworkEvents>
  usage: ReturnType<typeof useDataUsage>
  appUsage: ReturnType<typeof useAppUsage>
  hostUsage: ReturnType<typeof useHostUsage>
  trafficUsage: ReturnType<typeof useTrafficUsage>
  diagnostics: ReturnType<typeof useDiagnostics>
  services: ReturnType<typeof useServiceReachability>
}

/**
 * The backend data behind every screen. It lives here, above the views, so it
 * survives tab switches: leaving a tab unmounts its view but keeps its last
 * result, which is back on screen instantly when you return.
 *
 * Each source only fetches while a screen that shows it is open.
 */
export function useScreenData(
  location: AppLocation,
  info: NetworkInfo | null,
  internet: InternetStatus | null,
): ScreenData {
  const { tab } = location
  const appsView = location.appsSub?.view

  // Identity of the current network — when it changes, caches keyed on it are
  // invalidated so we never show the previous network's devices/results.
  const networkKey = info ? `${info.interfaceName ?? ''}|${info.ipAddress ?? ''}` : null

  // Whether the Home summary keeps its connected-device count warm (Settings).
  // On macOS, Home never auto-scans: device discovery needs the Local Network
  // permission, so we wait until the user opens Devices or taps Scan on the
  // Home widget.
  const [isHomeDeviceScanEnabled] = useSetting('homeDeviceScan', true)
  const shouldScanDevices = tab === 'devices' || (tab === 'home' && !IS_MAC && isHomeDeviceScanEnabled)

  const interfaces = useNetworkInterfaces(tab === 'interfaces')
  const devices = useDevices(shouldScanDevices, networkKey)
  const events = useNetworkEvents(tab === 'events', devices.isScanning)
  const usage = useDataUsage(tab === 'usage' || tab === 'home')
  const appUsage = useAppUsage(tab === 'apps')
  const hostUsage = useHostUsage(tab === 'apps' && appsView === 'hosts')
  const trafficUsage = useTrafficUsage(tab === 'apps' && appsView === 'traffic')
  const diagnostics = useDiagnostics(tab === 'diagnostics', networkKey)
  const services = useServiceReachability(tab === 'services', networkKey, internet)

  return { interfaces, devices, events, usage, appUsage, hostUsage, trafficUsage, diagnostics, services }
}
