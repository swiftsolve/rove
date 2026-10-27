import type { MouseEvent } from 'react'
import { useAppData } from '@/app/hooks/useAppData'
import { useNavigation } from '@/app/hooks/useNavigation'
import { IS_MAC } from '@/lib/platform'
import { DevicesIcon, SearchIcon } from '@/components/icons/Icons'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { EmptyStatMetric, StatCard, StatReadout } from '@/features/home/components/StatCard'
import { Button } from '@/components/Button'
import styles from './DevicesCard.module.css'

function ariaLabelFor(deviceCount: number | null, onlineDeviceCount: number | null, isScanning: boolean): string {
  if (isScanning) return 'Scanning for devices. Open Devices.'
  if (deviceCount == null) return 'Devices'
  const onlinePrefix = onlineDeviceCount != null ? `${onlineDeviceCount} of ` : ''
  return `${onlinePrefix}${deviceCount} devices online. Open Devices.`
}

/** How many devices on the network are online; opens the Devices tab. */
export function DevicesCard(): JSX.Element {
  const devices = useAppData().screens.devices
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
      // With a Discover button inside, the card renders as a clickable div so
      // the button isn't nested in a button; tapping elsewhere still opens Devices.
      hasInteractiveBody={shouldShowScanButton}
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
      <div className={styles.loading} aria-hidden>
        <ButtonSpinner size={14} color="var(--text-secondary)" />
      </div>
    )
  }

  if (deviceCount != null) {
    return (
      <div className={styles.count} aria-hidden>
        <StatReadout
          marker="online"
          value={String(onlineDeviceCount ?? deviceCount)}
          unit="online"
          className={styles.readout}
        />
      </div>
    )
  }

  if (onScan) {
    const handleScan = (event: MouseEvent<HTMLButtonElement>): void => {
      // The card navigates on click; keep Discover to its own action.
      event.stopPropagation()
      onScan()
    }
    return (
      <div className={styles.scan}>
        <Button className={styles.scanButton} onClick={handleScan}>
          <SearchIcon size={14} />
          Discover
        </Button>
      </div>
    )
  }

  return <EmptyStatMetric />
}
