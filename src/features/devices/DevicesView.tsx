import type { ReactNode } from 'react'

import { DeviceRow } from '@/features/devices/components/DeviceRow'
import { OnlineIndicator } from '@/features/devices/components/OnlineIndicator'
import { ScanStatus } from '@/features/devices/components/ScanStatus'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { sortDevices } from '@/features/devices/utils/device-display'
import { countTitle } from '@/lib/format'
import { IS_MAC } from '@/lib/platform'
import type { LanDevice } from '@/types'
import {
  Banner,
  Button,
  DevicesIcon,
  EmptyState,
  HelpIcon,
  IconButton,
  LoadingState,
  PageHeader,
  RefreshIcon,
} from '@/ui'

const SCAN_HINT =
  'Rove probes your subnet and listens for device announcements. Sleeping devices, guest networks and subnets over /24 can hide some.'

const NO_DEVICES_HINT = 'Nothing answered on this network. Check you’re on the right Wi-Fi.'

const LOCAL_NETWORK_HINT =
  'Missing devices? Allow Rove in System Settings › Privacy & Security › Local Network, then scan again.'

/**
 * The header's description once the scan has a subnet; until then the scan's
 * status fills the line. A plain function rather than a component: PageHeader
 * collapses the line only when both are undefined.
 */
function renderDescription(
  subnet: string | null,
  hasDevices: boolean,
  isScanning: boolean,
  onlineCount: number,
): ReactNode {
  if (hasDevices && subnet) {
    return (
      <span className="inline-flex items-baseline gap-6">
        <span className="type-overline text-tertiary">Subnet</span>
        <span className="num">{subnet}</span>
        {/* The tally and the scan status cross-slide in one slot, which is the
            live region for both. ml-2 plus the 6px gap gives the 8px dot spacing. */}
        <span className="relative ml-2 inline-block" role="status">
          <OnlineIndicator isActive={!isScanning} count={onlineCount} />
          <ScanStatus isActive={isScanning} isLiveRegion={false} />
        </span>
      </span>
    )
  }
  return undefined
}

/** The page body: a first-scan spinner, an empty state with a retry, or the device list. */
function DevicesBody({
  devices,
  isScanning,
  shouldShowLocalNetworkHint,
  onRescan,
}: {
  devices: LanDevice[]
  isScanning: boolean
  shouldShowLocalNetworkHint: boolean
  onRescan: () => void
}) {
  if (isScanning && devices.length === 0) {
    return <LoadingState label="Scanning your network…" />
  }
  if (devices.length === 0) {
    return (
      <EmptyState
        title="No devices found"
        description={shouldShowLocalNetworkHint ? LOCAL_NETWORK_HINT : NO_DEVICES_HINT}
        actions={<Button onClick={onRescan}>Scan again</Button>}
      />
    )
  }
  return (
    <div className="flex flex-col gap-10">
      <ul role="list" aria-label="Devices" aria-busy={isScanning} className="flex flex-col gap-10">
        {devices.map((device) => (
          <DeviceRow key={`${device.mac}-${device.ip}`} device={device} />
        ))}
      </ul>
      {/* The empty state shows its own copy; this trails a non-empty list. */}
      {shouldShowLocalNetworkHint && (
        <p className="type-body-small text-tertiary mt-10 max-w-[40ch] px-4">{LOCAL_NETWORK_HINT}</p>
      )}
    </div>
  )
}

export function DevicesView() {
  const { lastScan, isScanning, error, rescan } = useDevices()
  const onRescan = (): void => void rescan()
  const devices = sortDevices(lastScan?.devices ?? [])
  const hasDevices = devices.length > 0
  const onlineCount = devices.filter((device) => device.isReachable).length
  const subnet = lastScan?.subnet ?? null
  // Only this machine (or nothing): on macOS, usually a withheld Local Network grant.
  const isOnlySelf = !isScanning && lastScan != null && devices.every((device) => device.isSelf)
  const shouldShowLocalNetworkHint = IS_MAC && isOnlySelf

  return (
    <div className="page">
      <PageHeader
        icon={<DevicesIcon size={18} />}
        title={countTitle(devices.length, 'device', 'Devices')}
        description={renderDescription(subnet, hasDevices, isScanning, onlineCount)}
        status={isScanning && !(hasDevices && subnet) ? <ScanStatus isActive isLiveRegion /> : undefined}
        actions={
          <>
            <IconButton label="About device scanning" icon={HelpIcon} tooltip={SCAN_HINT} />
            {/* Clickable while scanning (busy clicks are ignored) so its tooltip still shows. */}
            <IconButton label="Scan again" icon={RefreshIcon} isLoading={isScanning} onClick={onRescan} />
          </>
        }
      />

      {error && (
        <Banner
          variant="error"
          title={error}
          description={lastScan ? 'Showing the last scan.' : 'Try again in a moment.'}
          onRetry={rescan}
        />
      )}

      <DevicesBody
        devices={devices}
        isScanning={isScanning}
        shouldShowLocalNetworkHint={shouldShowLocalNetworkHint}
        onRescan={onRescan}
      />
    </div>
  )
}
