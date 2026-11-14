import {
  CameraIcon,
  Card,
  ComputerIcon,
  ConsoleIcon,
  DeviceIcon,
  type IconComponent,
  IconTile,
  type IconTileColor,
  InlineMeta,
  NasIcon,
  NoValue,
  PrinterIcon,
  RouterIcon,
  SmartHomeIcon,
  SpeakerIcon,
  StatusDot,
  TabletIcon,
  Tooltip,
  TvIcon,
  UnknownDeviceIcon,
  WatchIcon,
} from '@swiftsolve/rove-ui'
import { cva, cx } from 'class-variance-authority'
import type { JSX } from 'react'

import { SpeakableText } from '@/app/components/SpeakableText'
import { deviceMetaParts, deviceNameParts, gatewayProduct, lastSeenAge } from '@/features/devices/utils/device-display'
import { useNow } from '@/hooks/useNow'
import type { LanDevice, LanDeviceKind } from '@/types'
import { formatMac } from '@/utils/format'

const DEVICE_ROW = cx('flex items-start gap-12', 'px-(--card-header-padding-x) py-(--card-header-padding-y)')

/**
 * A device's kind icon, in a tile coloured by its group so groups scan at a
 * glance. Device colours say what a device is, never how it's doing, so no
 * status colour here: the gateway takes the network colour whatever its kind,
 * and unknown devices stay neutral. This device, the one Rove runs on, takes
 * the accent instead, as it does on the Path card.
 */
const KIND_COLORS: Record<LanDeviceKind, IconTileColor> = {
  router: 'var(--device-network)',
  nas: 'var(--device-network)',
  computer: 'var(--device-personal)',
  tablet: 'var(--device-personal)',
  phone: 'var(--device-personal)',
  watch: 'var(--device-personal)',
  console: 'var(--device-entertainment)',
  tv: 'var(--device-entertainment)',
  speaker: 'var(--device-entertainment)',
  camera: 'var(--device-smart-home)',
  printer: 'var(--device-smart-home)',
  iot: 'var(--device-smart-home)',
  unknown: 'neutral',
}

/** The Online / Offline status beside a device's name. */
const stateVariants = cva('type-caption inline-flex shrink-0 items-center gap-6', {
  variants: {
    isReachable: { true: 'text-positive', false: 'text-tertiary' },
  },
  defaultVariants: { isReachable: false },
})

// On Heading, the card titles' style.
const DEVICE_NAME = cx(
  'type-heading min-w-0 flex-1 leading-title text-primary',
  'line-clamp-2 wrap-anywhere [line-clamp:2]',
)

const DEVICE_META = 'type-caption text-tertiary flex min-w-0 items-baseline gap-8'

const DEVICE_KIND = 'min-w-0 flex-[0_1_auto]'

const KIND_ICONS: Record<LanDeviceKind, IconComponent> = {
  router: RouterIcon,
  nas: NasIcon,
  computer: ComputerIcon,
  tablet: TabletIcon,
  phone: DeviceIcon,
  watch: WatchIcon,
  console: ConsoleIcon,
  tv: TvIcon,
  printer: PrinterIcon,
  camera: CameraIcon,
  speaker: SpeakerIcon,
  iot: SmartHomeIcon,
  unknown: UnknownDeviceIcon,
}

// Coarse on purpose: a last-seen age only ever renders whole minutes, and a
// row's clock ticks in a list that can be long.
const ROW_CLOCK_INTERVAL_MS = 30_000

function KindIcon({ kind }: { kind: LanDeviceKind }) {
  const Icon = KIND_ICONS[kind]
  return <Icon size={16} />
}

/**
 * The line under a device's name. The gateway shows its "Gateway" role beside
 * the resolved product (or a bare "Gateway" when nothing resolved), a shade
 * brighter than the meta but not green: it's a role, not a status. Other
 * devices show their kind/vendor/OS/model and, when offline, how long ago they
 * were last seen.
 */
function DeviceMetaLine({
  device,
  nameParts,
  lastSeenLabel,
}: {
  device: LanDevice
  nameParts: string[]
  lastSeenLabel: string | null
}): JSX.Element | null {
  if (device.isGateway) {
    const product = gatewayProduct(device)
    return (
      <div className={DEVICE_META}>
        <InlineMeta
          items={[
            <span key="role" className="text-secondary">
              Gateway
            </span>,
            ...(product ? [product] : []),
          ]}
          className={DEVICE_KIND}
          shouldTruncate
        />
      </div>
    )
  }

  const metaParts = deviceMetaParts(device, nameParts)
  if (metaParts.length === 0 && !lastSeenLabel) return null
  return (
    <div className={DEVICE_META}>
      {metaParts.length > 0 && (
        <InlineMeta
          items={metaParts.map((part) => (
            <SpeakableText key={part} text={part} />
          ))}
          className={DEVICE_KIND}
          shouldTruncate
        />
      )}
      {/* ml-auto keeps the age flush right even when the type label is absent. */}
      {lastSeenLabel && <span className="ml-auto shrink-0">{lastSeenLabel}</span>}
    </div>
  )
}

function deviceTileColor(device: LanDevice): IconTileColor {
  if (device.isSelf) return 'var(--accent-default)'
  if (device.isGateway) return 'var(--device-network)'
  return KIND_COLORS[device.kind]
}

export function DeviceRow({ device }: { device: LanDevice }) {
  const now = useNow(ROW_CLOCK_INTERVAL_MS)
  const nameParts = deviceNameParts(device)
  const lastSeenLabel = lastSeenAge(device, now)
  const shouldShowRandomizedTag = device.isRandomizedMac && !device.isGateway && !device.isSelf

  return (
    <Card as="li">
      <div className={DEVICE_ROW}>
        <IconTile color={deviceTileColor(device)} icon={<KindIcon kind={device.kind} />} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* mb-2 adds a touch more air below the larger name, on top of the
              column's 4px gap. */}
          <div className="mb-2 flex items-start justify-between gap-8">
            <h2 className={DEVICE_NAME}>
              <InlineMeta items={nameParts} />
            </h2>
            {/* "Online" says it all; only "Offline" gets a tooltip, saying why. A span
                can't take focus, so the reason is spoken from the text, not the tooltip. */}
            {device.isReachable ? (
              <span className={stateVariants({ isReachable: true })}>
                <StatusDot />
                Online
              </span>
            ) : (
              <Tooltip content="No response to recent scans" shouldDescribe={false}>
                <span className={stateVariants({ isReachable: false })}>
                  <StatusDot />
                  Offline
                  <span className="sr-only">, no response to recent scans</span>
                </span>
              </Tooltip>
            )}
          </div>

          <DeviceMetaLine device={device} nameParts={nameParts} lastSeenLabel={lastSeenLabel} />

          <div className="flex items-baseline justify-between gap-8">
            <span className="type-caption min-w-0 text-tertiary tabular-nums">
              <InlineMeta
                items={[
                  <>
                    <span className="sr-only">MAC address </span>
                    {formatMac(device.mac) ?? <NoValue />}
                  </>,
                  shouldShowRandomizedTag && (
                    // The hint isn't announced here; the sr-only words say it.
                    <Tooltip content="Privacy-randomized MAC address" shouldDescribe={false}>
                      <span className="whitespace-nowrap">
                        <span aria-hidden>Randomized</span>
                        <span className="sr-only">, privacy-randomized</span>
                      </span>
                    </Tooltip>
                  ),
                ]}
              />
            </span>
            <span className="type-caption shrink-0 num text-secondary">
              <span className="sr-only">IP address </span>
              {device.ip}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
