import type { MouseEvent } from 'react'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { useNavigation } from '@/app/hooks/useNavigation'
import { IS_MAC } from '@/lib/platform'
import { Button, ButtonSpinner, DevicesIcon, focusCardLink, SearchIcon } from '@/ui'
import { EmptyStatMetric, StatCard, StatReadout } from '@/features/home/components/StatCard'

function ariaLabelFor(deviceCount: number | null, onlineDeviceCount: number | null, isScanning: boolean): string {
  if (isScanning) return 'Scanning for devices. Open Devices.'
  if (deviceCount == null) return 'Open Devices.'
  const onlinePrefix = onlineDeviceCount != null ? `${onlineDeviceCount} of ` : ''
  return `${onlinePrefix}${deviceCount} devices online. Open Devices.`
}

/** How many devices on the network are online; opens the Devices tab. */
export function DevicesCard(): JSX.Element {
  const devices = useDevices()
  const { navigate } = useNavigation()
  const { scan, isScanning } = devices
  // Devices found by the last scan, or null before the first scan lands.
  const deviceCount = scan?.devices.length ?? null
  const onlineDeviceCount = scan ? scan.devices.filter((device) => device.isReachable).length : null
  // macOS only: scan from the card instead of auto-scanning on Home load.
  const onScan = IS_MAC ? (): void => void devices.rescan() : undefined

  // macOS before its first scan: no count yet, nothing loading, and a scan
  // handler wired up. Offer a Discover button in place of the auto-scanned count.
  const shouldShowScanButton = deviceCount == null && !isScanning && onScan != null

  return (
    <StatCard
      icon={<DevicesIcon size={15} />}
      label="Devices"
      ariaLabel={ariaLabelFor(deviceCount, onlineDeviceCount, isScanning)}
      onOpen={() => navigate({ tab: 'devices' })}
      isLoading={isScanning}
    >
      <DevicesCardBody
        deviceCount={deviceCount}
        onlineDeviceCount={onlineDeviceCount}
        isScanning={isScanning}
        onScan={shouldShowScanButton ? onScan : undefined}
      />
    </StatCard>
  )
}

function DevicesCardBody({
  deviceCount,
  onlineDeviceCount,
  isScanning,
  onScan,
}: {
  deviceCount: number | null
  onlineDeviceCount: number | null
  isScanning: boolean
  /** Set only when the Discover button should show. */
  onScan?: () => void
}): JSX.Element {
  // Show the spinner whenever a scan is in flight — from the Home Discover
  // button, or a rescan started on the Devices page (shared state). A
  // background poll is silent (never toggles the busy flag), so this only
  // replaces the count during a real scan, not every refresh.
  if (isScanning) {
    return (
      // Centres the wave in the card's remaining height (the card is
      // grid-stretched to the taller Usage card), nudged down a little toward the
      // body's centre. No min-height: a floor would push the grid row taller.
      <div className="flex flex-1 items-center justify-center pt-6" aria-hidden>
        <ButtonSpinner size={14} color="var(--text-secondary)" />
      </div>
    )
  }

  if (deviceCount != null) {
    return (
      // The key dot is small, so it gets a touch more room before the count
      // than the usage arrows get.
      <div aria-hidden>
        <StatReadout
          marker="online"
          value={String(onlineDeviceCount ?? deviceCount)}
          unit="online"
          className="gap-8"
        />
      </div>
    )
  }

  if (onScan) {
    // Discover is a sibling of the card's link (not inside it), so its
    // click runs its own action only. The spinner replaces it once the scan
    // starts, so focus moves to the card's link rather than being lost.
    const handleScan = (event: MouseEvent<HTMLButtonElement>): void => {
      focusCardLink(event.currentTarget)
      onScan()
    }
    return (
      // Centred at the foot of the card's remaining height, like the loading wave.
      // The button rises above the card's stretched link to take its own
      // clicks, with a nudge lower.
      <div className="flex flex-1 items-end justify-center">
        <Button className="relative z-2 -mb-4" icon={SearchIcon} onClick={handleScan}>
          Discover
        </Button>
      </div>
    )
  }

  return <EmptyStatMetric />
}
