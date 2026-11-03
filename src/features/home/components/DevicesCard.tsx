import type { MouseEvent } from 'react'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { useNavigation } from '@/app/hooks/useNavigation'
import { IS_MAC } from '@/lib/platform'
import { Button, ButtonSpinner, DevicesIcon, focusCardLink, SearchIcon } from '@/ui'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'

/** How many devices on the network are online; opens the Devices tab. */
export function DevicesCard() {
  const { lastScan, isScanning, rescan } = useDevices()
  const { navigate } = useNavigation()
  // Null before the first scan lands.
  const onlineCount = lastScan ? lastScan.devices.filter((device) => device.isReachable).length : null
  // macOS doesn't scan on Home load, so until its first scan the card offers one.
  const canDiscover = IS_MAC && !lastScan && !isScanning

  return (
    <StatCard
      icon={<DevicesIcon size={15} />}
      title="Devices"
      linkLabel={devicesLinkLabel(onlineCount, isScanning)}
      onOpen={() => navigate({ tab: 'devices' })}
      isLoading={isScanning}
    >
      <DevicesCardBody
        onlineCount={onlineCount}
        isScanning={isScanning}
        onDiscover={canDiscover ? () => void rescan() : undefined}
      />
    </StatCard>
  )
}

function devicesLinkLabel(onlineCount: number | null, isScanning: boolean): string {
  if (isScanning) return 'Scanning for devices. Open Devices.'
  if (onlineCount === null) return 'Open Devices.'
  return `${onlineCount} ${onlineCount === 1 ? 'device' : 'devices'} online. Open Devices.`
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
      // The key dot is small, so it gets more room before the count than the usage arrows do.
      <div aria-hidden>
        <StatReadout marker="online" value={String(onlineCount)} unit="online" className="gap-8" />
      </div>
    )
  }
  if (onDiscover) return <DiscoverButton onDiscover={onDiscover} />
  return <EmptyStatReadout />
}

/**
 * Centred in the card's remaining height (the grid stretches the card to the
 * Usage card's), nudged down toward the body's centre. No min-height: it would
 * make the grid row taller.
 */
function ScanSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center pt-6" aria-hidden>
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
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    focusCardLink(event.currentTarget)
    onDiscover()
  }
  return (
    // At the foot of the card, raised above its stretched link to take its own clicks, and nudged lower.
    <div className="flex flex-1 items-end justify-center">
      <Button className="relative z-2 -mb-4" icon={SearchIcon} onClick={handleClick}>
        Discover
      </Button>
    </div>
  )
}
