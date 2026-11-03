import type { ReactNode } from 'react'

import { DeviceRow } from '@/features/devices/components/DeviceRow'
import { OnlineIndicator } from '@/features/devices/components/OnlineIndicator'
import { ScanStatus } from '@/features/devices/components/ScanStatus'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { sortDevices } from '@/features/devices/utils/device-display'
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

// Local Network access can't be queried on macOS, so when discovery comes up
// empty we surface the most likely cause rather than implying the LAN is bare.
const NO_DEVICES_HINT = 'Nothing answered on this network. Check you’re on the right Wi-Fi.'

const LOCAL_NETWORK_HINT =
  'Missing devices? Allow Rove in System Settings › Privacy & Security › Local Network, then scan again.'

/** "3 devices" once some are listed, else the plain page name. */
function headerTitle(count: number): string {
  if (count === 0) return 'Devices'
  return `${count} ${count === 1 ? 'device' : 'devices'}`
}

/** The header's description once the scan has a subnet; until then the scan's
 *  status fills the line. A plain function rather than a component: PageHeader
 *  collapses the line only when both are undefined. */
function renderDescription(
  subnet: string | null,
  hasDevices: boolean,
  isScanning: boolean,
  onlineCount: number,
): ReactNode {
  if (hasDevices && subnet) {
    return (
      // "Subnet" label and value on one line, aligned on their baselines.
      <span className="inline-flex items-baseline gap-6">
        <span className="type-overline text-tertiary">Subnet</span>
        <span className="num">{subnet}</span>
        {/* One slot shared by the online tally and the scan status. The
            entering one holds the slot's width while the leaving one is
            overlaid absolutely (see CSS), so they cross-slide in place
            instead of shoving each other sideways. The slot is the live
            region, so both the scan stages and the final tally are read out;
            the leaving one is hidden from it. */}
        {/* The 2px set-off on top of the row's 6px gap puts the dot 8px from the
            subnet, the spacing every dot separator keeps (see .sep-dot). */}
        <span className="relative ml-2 inline-block" role="status">
          <OnlineIndicator isActive={!isScanning} count={onlineCount} />
          <ScanStatus isActive={isScanning} isLiveRegion={false} />
        </span>
      </span>
    )
  }
  return undefined
}

/** The page body: a first-scan spinner, an empty state with a retry, or the
 *  device list. */
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
      {/* The Local Network hint trailing a scan that did find devices; the
          blank-state copy is laid out by <EmptyState>. */}
      {shouldShowLocalNetworkHint && (
        <p className="type-body-default text-tertiary mt-10 max-w-[40ch] px-4 text-sm leading-body-small">
          {LOCAL_NETWORK_HINT}
        </p>
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
  // Scan resolved but turned up only this machine (or nothing) — on macOS the
  // usual culprit is a withheld Local Network grant.
  const isOnlySelf = !isScanning && lastScan != null && devices.every((device) => device.isSelf)
  const shouldShowLocalNetworkHint = IS_MAC && isOnlySelf

  return (
    <div className="page">
      <PageHeader
        icon={<DevicesIcon size={18} />}
        title={headerTitle(devices.length)}
        description={renderDescription(subnet, hasDevices, isScanning, onlineCount)}
        // Until there's a subnet to show, the line is the scan's progress.
        status={isScanning && !(hasDevices && subnet) ? <ScanStatus isActive isLiveRegion /> : undefined}
        actions={
          <>
            <IconButton label="About device scanning" icon={HelpIcon} tooltip={SCAN_HINT} />
            {/* Kept clickable while scanning (busy clicks are ignored) so the
                tooltip still answers "why is this spinning". */}
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
