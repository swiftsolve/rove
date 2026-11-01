import type { LanDevice, LanDeviceKind } from '@/types'
import {
  CameraIcon,
  Card,
  ChipIcon,
  ComputerIcon,
  ConsoleIcon,
  DeviceIcon,
  InlineMeta,
  NasIcon,
  PrinterIcon,
  RouterIcon,
  SpeakerIcon,
  StatusDot,
  TabletIcon,
  TvIcon,
  UnknownDeviceIcon,
  WatchIcon,
} from '@/ui'
import { useNow } from '@/hooks/useNow'
import { formatMac } from '@/lib/format'
import { cva, cx, type VariantProps } from 'class-variance-authority'
import {
  deviceMetaParts,
  deviceName,
  gatewayProduct,
  lastSeenAge,
} from '@/features/devices/utils/device-display'

// The device card: icon pinned to the top-left, the body column fills the rest.
const DEVICE_ROW = cx(
  'flex items-start gap-12',
  'px-(--card-header-padding-x) py-(--card-header-padding-y)',
)

const ICON_TINT = 'bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-sm),transparent)]'

/** A device's kind glyph, in a tile tinted by category so categories scan at a
 *  glance. The gateway is green whatever its kind; watches and unknown devices
 *  stay neutral. */
const iconVariants = cva('flex size-[32px] shrink-0 items-center justify-center rounded-sm', {
  variants: {
    tone: {
      neutral: 'bg-inset text-secondary',
      down: ['text-series-down', ICON_TINT],
      up: ['text-series-up', ICON_TINT],
      warning: ['text-status-warning', ICON_TINT],
      positive: ['text-status-positive', ICON_TINT],
    },
  },
})

type IconTone = NonNullable<VariantProps<typeof iconVariants>['tone']>

const KIND_TONES: Record<LanDeviceKind, IconTone> = {
  router: 'positive',
  nas: 'down',
  computer: 'down',
  tablet: 'down',
  phone: 'down',
  watch: 'neutral',
  console: 'up',
  tv: 'up',
  printer: 'up',
  camera: 'warning',
  speaker: 'warning',
  iot: 'warning',
  unknown: 'neutral',
}

/** The Online / Offline status beside a device's name. */
const stateVariants = cva('inline-flex shrink-0 items-center gap-6 text-sm', {
  variants: {
    isReachable: { true: 'text-positive', false: 'text-tertiary' },
  },
})

// A long name uses up to two lines rather than truncating; the card grows to
// fit. It takes the row width the status doesn't. text-lg: the widget-title size
// (e.g. "Capabilities"), not text-heading-large's larger one.
const DEVICE_NAME = cx(
  'text-heading-large min-w-0 flex-1 text-lg',
  'line-clamp-2 [line-clamp:2] wrap-anywhere',
)

// Device kind, vendor, OS and model as a subtitle line under the name. It stays
// on one line and ellipsizes when space is tight, so an offline device's age
// remains a clean right-hand column instead of wrapping beneath it.
const DEVICE_META = 'flex min-w-0 items-baseline gap-8'

const DEVICE_KIND = 'text-caption min-w-0 flex-[0_1_auto] flex-nowrap overflow-hidden whitespace-nowrap'

// The privacy-randomized note, set off from the MAC by a small dot.
const RANDOMIZED_TAG = cx(
  'relative whitespace-nowrap pl-12 tracking-[0] text-tertiary',
  "before:absolute before:top-1/2 before:left-0 before:size-[3px] before:content-['']",
  'before:rounded-full before:bg-current before:opacity-55 before:-translate-y-1/2',
)

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

// Coarse on purpose: `relativeAge` only ever renders whole minutes, and a row's
// clock ticks in a list that can be long.
const ROW_CLOCK_INTERVAL_MS = 30_000

function KindIcon({ kind }: { kind: LanDeviceKind }): JSX.Element {
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
      {lastSeenLabel && <span className="text-caption ml-auto shrink-0">{lastSeenLabel}</span>}
    </div>
  )
}

export function DeviceRow({ device }: { device: LanDevice }): JSX.Element {
  const now = useNow(ROW_CLOCK_INTERVAL_MS)
  const name = deviceName(device)
  const lastSeenLabel = lastSeenAge(device, now)
  const shouldShowRandomizedTag = device.isRandomizedMac && !device.isGateway && !device.isSelf

  return (
    <Card as="li" className={DEVICE_ROW}>
      <span className={iconVariants({ tone: device.isGateway ? 'positive' : KIND_TONES[device.kind] })}>
        <KindIcon kind={device.kind} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Name on the left, status on the right. mb-2 adds a touch more air
            below the (larger) name, on top of the column's 4px gap. */}
        <div className="mb-2 flex items-start justify-between gap-8">
          <h2 className={DEVICE_NAME}>
            <InlineMeta items={name} />
          </h2>
          <span
            className={stateVariants({ isReachable: device.isReachable })}
            title={device.isReachable ? 'Reachable' : 'Offline — no response to recent scans'}
          >
            <StatusDot />
            {device.isReachable ? 'Online' : 'Offline'}
          </span>
        </div>

        <DeviceMetaLine device={device} name={name} lastSeenLabel={lastSeenLabel} />

        {/* MAC on the left, IP pinned to the bottom-right. */}
        <div className="flex items-baseline justify-between gap-8">
          <span className="text-caption inline-flex min-w-0 items-baseline gap-8 tabular-nums">
            <span>
              <span className="sr-only">MAC address </span>
              {formatMac(device.mac)}
            </span>
            {shouldShowRandomizedTag && (
              <span className={RANDOMIZED_TAG} title="Privacy-randomized MAC address">
                <span aria-hidden>Randomized</span>
                <span className="sr-only">, privacy-randomized</span>
              </span>
            )}
          </span>
          <span className="num shrink-0 text-secondary">
            <span className="sr-only">IP address </span>
            {device.ip}
          </span>
        </div>
      </div>
    </Card>
  )
}
