import type { ReactNode } from 'react'
import type { LanDevice } from '@/types'
import { EmptyState } from '@/components/EmptyState'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import { DevicesIcon, HelpIcon } from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { IS_MAC } from '@/lib/platform'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { DeviceRow } from '@/features/devices/components/DeviceRow'
import { OnlineIndicator } from '@/features/devices/components/OnlineIndicator'
import { ScanStatus } from '@/features/devices/components/ScanStatus'
import { sortDevices } from '@/features/devices/utils/device-display'
import { ErrorBanner } from '@/components/ErrorBanner'

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

/** The header subtitle. The subnet fades in once the scan resolves; a scanning
 *  hint fills the slot (which reserves its height, so the title never shifts)
 *  until then. A plain function rather than a component: ViewHeader collapses
 *  the slot only when the subtitle is undefined. */
function renderSubtitle(
  subnet: string | null,
  hasDevices: boolean,
  isScanning: boolean,
  onlineCount: number,
): ReactNode {
  if (hasDevices && subnet) {
    return (
      <>
        <span className="text-overline">Subnet</span>
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
      </>
    )
  }
  if (isScanning) return <ScanStatus isActive isLiveRegion />
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
}): JSX.Element {
  if (isScanning && devices.length === 0) {
    return (
      <div className="page-empty">
        <Spinner />
        <p className="text-muted">Scanning your network…</p>
      </div>
    )
  }
  if (devices.length === 0) {
    return (
      <EmptyState
        title="No devices found"
        hint={shouldShowLocalNetworkHint ? LOCAL_NETWORK_HINT : NO_DEVICES_HINT}
        action={
          <Button onClick={onRescan}>
            Scan again
          </Button>
        }
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
        <p className="text-muted mt-10 max-w-[40ch] px-4 text-sm leading-body-small">{LOCAL_NETWORK_HINT}</p>
      )}
    </div>
  )
}

export function DevicesView(): JSX.Element {
  const { scan, isScanning, error, rescan } = useDevices()
  const onRescan = (): void => void rescan()
  const devices = sortDevices(scan?.devices ?? [])
  const hasDevices = devices.length > 0
  const onlineCount = devices.filter((device) => device.isReachable).length
  const subnet = scan?.subnet ?? null
  // Scan resolved but turned up only this machine (or nothing) — on macOS the
  // usual culprit is a withheld Local Network grant.
  const isOnlySelf = !isScanning && scan != null && devices.every((device) => device.isSelf)
  const shouldShowLocalNetworkHint = IS_MAC && isOnlySelf

  return (
    <div className="page">
      <ViewHeader
        icon={<DevicesIcon size={18} />}
        title={headerTitle(devices.length)}
        subtitle={renderSubtitle(subnet, hasDevices, isScanning, onlineCount)}
        // "Subnet" label and value on one line, aligned on their baselines.
        subtitleClassName="inline-flex items-baseline gap-6"
        isSubtitleShown={hasDevices && subnet != null}
        actions={
          <>
            <Tooltip content={SCAN_HINT}>
              <IconButton
                aria-label="About device scanning"
              >
                <HelpIcon size={16} />
              </IconButton>
            </Tooltip>
            {/* Kept clickable while scanning (busy clicks are ignored) so the
                tooltip still answers "why is this spinning". */}
            <RefreshIconButton
              label="Scan again"
              isLoading={isScanning}
              onClick={onRescan}
            />
          </>
        }
      />

      {error && <ErrorBanner
          title={error}
          description={scan ? 'Showing the last scan.' : 'Try again in a moment.'}
          onRetry={rescan}
        />}

      <DevicesBody
        devices={devices}
        isScanning={isScanning}
        shouldShowLocalNetworkHint={shouldShowLocalNetworkHint}
        onRescan={onRescan}
      />
    </div>
  )
}
