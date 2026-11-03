import { cva, cx } from 'class-variance-authority'
import type { JSX } from 'react'

import { deviceMetaParts, deviceName, gatewayProduct, lastSeenAge } from '@/features/devices/utils/device-display'
import { useNow } from '@/hooks/useNow'
import { formatMac } from '@/lib/format'
import type { LanDevice, LanDeviceKind } from '@/types'
import {
  CameraIcon,
  Card,
  ChipIcon,
  ComputerIcon,
  ConsoleIcon,
  DeviceIcon,
  IconTile,
  type IconTileColor,
  InlineMeta,
  NasIcon,
  NoValue,
  PrinterIcon,
  RouterIcon,
  SpeakerIcon,
  StatusDot,
  TabletIcon,
  Tooltip,
  TvIcon,
  UnknownDeviceIcon,
  WatchIcon,
} from '@/ui'

const DEVICE_ROW = cx('flex items-start gap-12', 'px-(--card-header-padding-x) py-(--card-header-padding-y)')

/** A device's kind icon, in a tile coloured by category so categories scan at a
 *  glance. The gateway is green whatever its kind; watches and unknown devices
 *  stay neutral. */
const KIND_COLORS: Record<LanDeviceKind, IconTileColor> = {
  router: 'var(--status-positive)',
  nas: 'var(--series-down)',
  computer: 'var(--series-down)',
  tablet: 'var(--series-down)',
  phone: 'var(--series-down)',
  watch: 'neutral',
  console: 'var(--series-up)',
  tv: 'var(--series-up)',
  printer: 'var(--series-up)',
  camera: 'var(--status-warning)',
  speaker: 'var(--status-warning)',
  iot: 'var(--status-warning)',
  unknown: 'neutral',
}

/** The Online / Offline status beside a device's name. */
const stateVariants = cva('inline-flex shrink-0 items-center gap-6 text-sm', {
  variants: {
    isReachable: { true: 'text-positive', false: 'text-tertiary' },
  },
  defaultVariants: { isReachable: false },
})

// text-lg overrides type-heading-large's size to match the card titles.
const DEVICE_NAME = cx(
  'type-heading-large text-primary min-w-0 flex-1 text-lg',
  'line-clamp-2 [line-clamp:2] wrap-anywhere',
)

const DEVICE_META = 'type-caption text-tertiary flex min-w-0 items-baseline gap-8'

const DEVICE_KIND = 'min-w-0 flex-[0_1_auto]'

const KIND_ICONS: Record<LanDeviceKind, (props: { size?: number }) => JSX.Element> = {
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
  iot: ChipIcon,
  unknown: UnknownDeviceIcon,
}

// Coarse on purpose: a last-seen age only ever renders whole minutes, and a
// row's clock ticks in a list that can be long.
const ROW_CLOCK_INTERVAL_MS = 30_000

function KindIcon({ kind }: { kind: LanDeviceKind }) {
  const Icon = KIND_ICONS[kind]
  return <Icon size={16} />
}

/** The line under a device's name. The gateway shows its green "Gateway" role
 *  beside the resolved product (or a bare "Gateway" when nothing resolved);
 *  other devices show their kind/vendor/OS/model and, when offline, how long
 *  ago they were last seen. */
function DeviceMetaLine({
  device,
  name,
  lastSeenLabel,
}: {
  device: LanDevice
  name: string[]
  lastSeenLabel: string | null
}): JSX.Element | null {
  if (device.isGateway) {
    const product = gatewayProduct(device)
    return (
      <div className={DEVICE_META}>
        <InlineMeta
          items={[
            <span key="role" className="text-positive">
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

  const metaParts = deviceMetaParts(device, name)
  if (metaParts.length === 0 && !lastSeenLabel) return null
  return (
    <div className={DEVICE_META}>
      {metaParts.length > 0 && <InlineMeta items={metaParts} className={DEVICE_KIND} shouldTruncate />}
      {/* ml-auto keeps the age flush right even when the type label is absent. */}
      {lastSeenLabel && <span className="ml-auto shrink-0">{lastSeenLabel}</span>}
    </div>
  )
}

export function DeviceRow({ device }: { device: LanDevice }) {
  const now = useNow(ROW_CLOCK_INTERVAL_MS)
  const name = deviceName(device)
  const lastSeenLabel = lastSeenAge(device, now)
  const shouldShowRandomizedTag = device.isRandomizedMac && !device.isGateway && !device.isSelf

  return (
    <Card as="li">
      <div className={DEVICE_ROW}>
        <IconTile
          color={device.isGateway ? 'var(--status-positive)' : KIND_COLORS[device.kind]}
          icon={<KindIcon kind={device.kind} />}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* mb-2 adds a touch more air below the larger name, on top of the
              column's 4px gap. */}
          <div className="mb-2 flex items-start justify-between gap-8">
            <h2 className={DEVICE_NAME}>
              <InlineMeta items={name} />
            </h2>
            {/* A span can't take focus, so the hint is spoken from the text, not the tooltip. */}
            <Tooltip content={device.isReachable ? 'Reachable' : 'No response to recent scans'} shouldDescribe={false}>
              <span className={stateVariants({ isReachable: device.isReachable })}>
                <StatusDot />
                {device.isReachable ? 'Online' : 'Offline'}
                <span className="sr-only">{device.isReachable ? ', reachable' : ', no response to recent scans'}</span>
              </span>
            </Tooltip>
          </div>

          <DeviceMetaLine device={device} name={name} lastSeenLabel={lastSeenLabel} />

          <div className="flex items-baseline justify-between gap-8">
            <span className="type-caption text-tertiary min-w-0 tabular-nums">
              <InlineMeta
                items={[
                  <>
                    <span className="sr-only">MAC address </span>
                    {formatMac(device.mac) ?? <NoValue />}
                  </>,
                  shouldShowRandomizedTag && (
                    // The hint isn't announced here; the sr-only words say it.
                    <Tooltip content="Privacy-randomized MAC address" shouldDescribe={false}>
                      <span className="whitespace-nowrap text-tertiary">
                        <span aria-hidden>Randomized</span>
                        <span className="sr-only">, privacy-randomized</span>
                      </span>
                    </Tooltip>
                  ),
                ]}
              />
            </span>
            <span className="num shrink-0 text-secondary">
              <span className="sr-only">IP address </span>
              {device.ip}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
