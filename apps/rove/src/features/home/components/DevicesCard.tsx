import { Button, ButtonSpinner, DevicesIcon, focusCardLink, SearchIcon } from '@swiftsolve/rove-ui'
import type { MouseEvent } from 'react'

import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'
import { formatCount } from '@/utils/format'

/** How many devices on the network are online; opens the Devices tab. */
export function DevicesCard() {
  const { canHomeAutoScan, lastScan, isScanning, rescan } = useDevices()
  const { navigate } = useNavigation()
  const isConnected = useNetwork().info?.isConnected ?? false
  // Off a network there's nothing to count, so the card shows no count, scan
  // or Discover rather than a figure from before.
  const onlineCount = isConnected && lastScan ? lastScan.devices.filter((device) => device.isReachable).length : null
  const isShowingScan = isConnected && isScanning
  // Where Home doesn't scan on load, the card offers one until the first scan.
  const canDiscover = isConnected && !canHomeAutoScan && !lastScan && !isScanning

  return (
    <StatCard
      icon={<DevicesIcon size={15} />}
      title="Devices"
      linkLabel={devicesLinkLabel(onlineCount, isShowingScan)}
      onOpen={() => navigate({ tab: 'devices' })}
      isLoading={isShowingScan}
    >
      <DevicesCardBody
        onlineCount={onlineCount}
        isScanning={isShowingScan}
        onDiscover={canDiscover ? () => void rescan() : undefined}
      />
    </StatCard>
  )
}

function devicesLinkLabel(onlineCount: number | null, isScanning: boolean): string {
  if (isScanning) return 'Scanning for devices. Open Devices.'
  if (onlineCount === null) return 'Open Devices.'
  return `${formatCount(onlineCount, 'device')} online. Open Devices.`
}

type DevicesCardBodyProps = {
  onlineCount: number | null
  /** A scan is in flight, started here or on the Devices page: the scan is shared. */
  isScanning: boolean
  /** Set only when the Discover button should show. */
  onDiscover?: () => void
}

function DevicesCardBody({ onlineCount, isScanning, onDiscover }: DevicesCardBodyProps) {
  if (isScanning) return <ScanSpinner />
  if (onlineCount !== null) {
    return (
      <div aria-hidden>
        <StatReadout marker="online" value={String(onlineCount)} unit="online" />
      </div>
    )
  }
  if (onDiscover) return <DiscoverButton onDiscover={onDiscover} />
  return <EmptyStatReadout />
}

/**
 * Centred in the readout's space, which is a compact readout's height, so the
 * card keeps its size when the count replaces it. Anything taller (padding, a
 * min-height) would make the grid row taller.
 */
function ScanSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center" aria-hidden>
      <ButtonSpinner size={14} color="var(--text-secondary)" />
    </div>
  )
}

/**
 * Sits beside the card's link, not inside it, so its click only scans. The
 * spinner replaces it once the scan starts, so focus moves to the card's link
 * rather than being lost.
 */
function DiscoverButton({ onDiscover }: { onDiscover: () => void }) {
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    focusCardLink(event.currentTarget)
    onDiscover()
  }
  return (
    // Raised above the card's stretched link so it takes its own clicks. Taller
    // than the readout, so -my-4 lets it spill into the padding rather than
    // grow the card.
    <div className="flex flex-1 items-center justify-center">
      <Button className="relative z-2 -my-4" icon={SearchIcon} onClick={onClick}>
        Discover
      </Button>
    </div>
  )
}
