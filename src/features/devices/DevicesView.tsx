import { useEffect, useState, type ReactNode } from 'react'
import type { LanDevice, LanDeviceKind } from '@/types'
import { InlineMeta } from '@/components/DotSeparator'
import { EmptyState } from '@/components/EmptyState'
import { RefreshIconButton } from '@/components/RefreshIconButton'
import { Spinner } from '@/components/Spinner'
import { ViewHeader } from '@/components/ViewHeader'
import {
  CameraIcon,
  ChipIcon,
  ComputerIcon,
  ConsoleIcon,
  DeviceIcon,
  DevicesIcon,
  HelpIcon,
  NasIcon,
  PrinterIcon,
  RouterIcon,
  SpeakerIcon,
  TabletIcon,
  TvIcon,
  UnknownDeviceIcon,
  WatchIcon,
} from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { useNow } from '@/hooks/useNow'
import { IS_MAC } from '@/lib/platform'
import { formatMac } from '@/lib/format'
import { cva, cx, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { SECTION_CARD } from '@/components/Section'
import { LAN_DEVICE_KIND_LABELS } from '@/features/devices/utils/device-kind-labels'

// The one on its way out overlays the slot's start rather than taking layout
// space, so the incoming one doesn't get shoved right then snap back.
const LEAVING = ['absolute top-0 left-0', 'animate-scan-slide-out']

/** The scan status and the online tally: `isLeaving` plays the slide-out. The
 *  scan status is inline-block, not flex, so its dot can be nudged to the text's
 *  optical middle with vertical-align (flex centring reads a touch low). */
const scanVariants = cva('inline-block whitespace-nowrap text-tertiary', {
  variants: {
    isLeaving: { true: LEAVING, false: 'animate-scan-slide-in' },
  },
})

const onlineVariants = cva('whitespace-nowrap text-tertiary', {
  variants: {
    isLeaving: { true: LEAVING, false: 'animate-scan-slide-in' },
  },
})

// The green dot before the online tally and the scan status. Nudged up 1px from
// vertical-align's x-height middle to centre on the digits' cap height, the same
// in both so the dot lands in the exact same spot when the two swap.
const STATUS_DOT = cx(
  'relative -top-px mr-8 inline-block size-[5px] align-middle',
  'rounded-full bg-status-positive',
)

/** One stage word: waits below, settles as the current stage, then drifts up,
 *  so entering and leaving read as one continuous rising motion. */
const scanPhaseVariants = cva(
  'absolute top-0 left-0 transition-[opacity,transform] duration-(--duration-normal) ease-out',
  {
    variants: {
      state: {
        past: 'opacity-0 transform-[translateY(-5px)]',
        current: 'opacity-100 transform-none',
        next: 'opacity-0 transform-[translateY(5px)]',
      },
    },
  },
)

// The device card: icon pinned to the top-left, the body column fills the rest.
const DEVICE_ROW = cn(
  SECTION_CARD,
  'flex items-start gap-12',
  'px-(--section-header-padding-x) py-(--section-header-padding-y)',
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
// (e.g. "Capabilities"), not text-title's larger one.
const DEVICE_NAME = cx(
  'text-title min-w-0 flex-1 text-lg',
  'line-clamp-2 [line-clamp:2] wrap-anywhere',
)

// Device kind, vendor, OS and model as a subtitle line under the name. It stays
// on one line and ellipsizes when space is tight, so an offline device's age
// remains a clean right-hand column instead of wrapping beneath it.
const DEVICE_META = 'flex min-w-0 items-baseline gap-8'

const DEVICE_KIND = cx(
  'text-meta min-w-0 flex-[0_1_auto] flex-nowrap overflow-hidden whitespace-nowrap',
  '[&_.inline-meta-item]:overflow-hidden [&_.inline-meta-item]:text-ellipsis',
)

// The privacy-randomized note, set off from the MAC by a small dot.
const RANDOMIZED_TAG = cx(
  'relative whitespace-nowrap pl-12 tracking-[0] text-tertiary',
  "before:absolute before:top-1/2 before:left-0 before:size-[3px] before:content-['']",
  'before:rounded-full before:bg-current before:opacity-55 before:-translate-y-1/2',
)

type ScanPhaseState = 'past' | 'current' | 'next'

const SCAN_HINT =
  'Rove scans your subnet and reads mDNS, SSDP/UPnP, NetBIOS and HTTP replies to identify devices. A device that blocks every probe and announces nothing at all can still be missed.'

// Local Network access can't be queried on macOS, so when discovery comes up
// empty we surface the most likely cause rather than implying the LAN is bare.
const LOCAL_NETWORK_HINT =
  'Missing devices? Rove needs Local Network access. Enable it in System Settings › Privacy & Security › Local Network, then scan again.'

// Singular device nouns for synthesizing a name — distinct from the category
// labels in LAN_DEVICE_KIND_LABELS ("Mobile", "Smart home"), which don't read
// naturally after an OS ("Android Mobile"). "unknown" has no noun by design.
const KIND_NOUNS: Record<Exclude<LanDeviceKind, 'unknown'>, string> = {
  router: 'router',
  nas: 'NAS',
  computer: 'computer',
  tablet: 'tablet',
  phone: 'phone',
  watch: 'watch',
  console: 'game console',
  tv: 'TV',
  printer: 'printer',
  camera: 'camera',
  speaker: 'speaker',
  iot: 'smart home device',
}

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

const MINUTE_MS = 60_000

// An offline device seen this recently is still in the ARP table but not
// answering, so its age is suppressed (see lastSeenAge).
const RECENTLY_SEEN_MS = 90_000

// Coarse on purpose: `relativeAge` only ever renders whole minutes, and a row's
// clock ticks in a list that can be long.
const ROW_CLOCK_INTERVAL_MS = 30_000

// The scan runs its stages concurrently and reports no per-stage progress, so
// ScanStatus steps through them on a timer — a forward-reading approximation, in
// the pipeline's real order (sweep the subnet, listen for announcements, then
// name and classify what replied). It holds on the last stage until the scan ends.
const SCAN_PHASES = ['Sweeping', 'Listening', 'Identifying'] as const
const SCAN_PHASE_MS = 1300

// How long the exit slide plays before the indicator unmounts. Matches
// --duration-normal, the length of `animate-scan-slide-out`.
const SCAN_EXIT_MS = 220

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function kindNoun(device: LanDevice): string | null {
  return device.kind !== 'unknown' ? KIND_NOUNS[device.kind] : null
}

// A privacy-randomized phone often has no OUI vendor and no hostname, yet the
// scan still identifies its OS/kind (e.g. via the DHCP fingerprint). Rather than
// fall straight to "Generic device", name it from whatever we did learn:
// "Android phone", "Android device", or just "Phone".
function describeUnnamed(device: LanDevice): string {
  const noun = kindNoun(device)
  if (device.os && noun) return `${device.os} ${noun}`
  if (device.os) return `${device.os} device`
  if (noun) return capitalize(noun)
  return 'Generic device'
}

function deviceName(device: LanDevice): string {
  if (device.isGateway) return 'Router'
  if (device.isSelf) return 'This device'
  // A real hostname is the name the user gave the device — it always wins.
  if (device.hostname) return device.hostname
  // Keep the kind beside a known maker rather than letting the vendor replace
  // it, so the kind never drops out of the name. A vendor is a brand, so it
  // reads as maker · type ("Apple · Phone"), matching the dot-separated meta
  // line; when the maker is unknown, fall back to the OS/kind synthesis.
  if (!device.vendor) return describeUnnamed(device)
  // A smart-home device's noun ("smart home device") is verbose and already
  // spelled out in the kind chip below the name ("Smart home"), so pairing it
  // with the maker reads as "Espressif · Smart home device". Show the maker
  // alone there — the chip carries the category.
  if (device.kind === 'iot') return device.vendor
  const noun = kindNoun(device)
  return noun ? `${device.vendor} · ${capitalize(noun)}` : device.vendor
}

// A coarse "3m ago" / "2h ago" / "4d ago". We only ever show this for offline
// devices, so second-level precision isn't worth it.
function relativeAge(ms: number): string {
  const mins = Math.floor(ms / MINUTE_MS)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// A bare "12m ago" for an offline device, shown inline in the meta line. The
// "Offline" badge already carries the meaning, so the age needs no "Last seen"
// prefix. Suppressed when it was seen within RECENTLY_SEEN_MS — that's a device
// still in the ARP table but not answering, where "just now" would only read as
// a contradiction. A device merged back from the roster carries an older
// timestamp and gets the age.
function lastSeenAge(device: LanDevice, now: number): string | null {
  if (device.isReachable || device.lastSeen == null) return null
  const ms = now - device.lastSeen
  if (ms < RECENTLY_SEEN_MS) return null
  return relativeAge(ms)
}

// Kind · vendor · OS · model, dropping unknown parts. Vendor comes from the
// MAC OUI (or an inferred maker like Apple); OS from the passive DHCP
// fingerprint. Case-insensitively drop any part that just repeats the name
// (e.g. a nameless host shown as its vendor) or an earlier part (an Apple
// handheld whose vendor and OS are both "Apple").
function deviceMetaParts(device: LanDevice, name: string): string[] {
  const seen = new Set<string>([name.toLowerCase()])
  return [
    device.kind !== 'unknown' ? LAN_DEVICE_KIND_LABELS[device.kind] : undefined,
    device.vendor ?? undefined,
    device.os ?? undefined,
    device.model ?? undefined,
  ].filter((part): part is string => {
    if (!part) return false
    const key = part.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isGenericGatewayName(part: string): boolean {
  return part.toLowerCase() === 'router' || part.toLowerCase() === 'gateway'
}

// The gateway's name is the generic role "Router", so the product we resolved
// (e.g. "Giga Hub 2.0") would otherwise never surface. Prefer the UPnP
// friendlyName (the gateway's hostname, which the display name discards),
// falling back to the hardware model — but skip a generic reverse-DNS hostname
// like "router" so the real model wins instead.
function gatewayProduct(device: LanDevice): string | null {
  return [device.hostname, device.model].find((part) => part && !isGenericGatewayName(part)) ?? null
}

// Online first (keeping the scan's order among them), then offline devices
// most-recently-seen first. A stable sort preserves the live ordering within
// each group.
function sortDevices(devices: LanDevice[]): LanDevice[] {
  return [...devices].sort((a, b) => {
    if (a.isReachable !== b.isReachable) return a.isReachable ? -1 : 1
    if (!a.isReachable) return (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
    return 0
  })
}

function scanPhaseState(index: number, currentPhase: number): ScanPhaseState {
  if (index === currentPhase) return 'current'
  return index < currentPhase ? 'past' : 'next'
}

function KindIcon({ kind }: { kind: LanDeviceKind }): JSX.Element {
  const Icon = KIND_ICONS[kind]
  return <Icon size={16} />
}

// A pulsing green dot + one-word stage. On first load it fills the subtitle
// slot alone; on a rescan it trails the subnet.
//
// Motion: the indicator slides in from the left when a scan starts, the stage
// words fade upward through each other while it runs, and on completion the
// whole thing slides back out to the left. The exit is why it takes `isActive`
// instead of being conditionally rendered — it stays mounted for SCAN_EXIT_MS
// after the scan ends so the slide-out can play.
//
// All three words are stacked (a hidden sizer holds the width to the longest
// so the layout never jumps); each one's state class (past, current, next) places it.
//
// `isLiveRegion` makes it its own polite live region; off when it shares the
// subnet's indicator slot, which is the live region there.
function ScanStatus({
  isActive,
  isLiveRegion,
}: {
  isActive: boolean
  isLiveRegion: boolean
}): JSX.Element | null {
  const [phase, setPhase] = useState(0)
  const [isMounted, setIsMounted] = useState(isActive)
  if (isActive && !isMounted) setIsMounted(true)

  // Step the stage word while a scan runs.
  useEffect(() => {
    if (!isActive) return
    const intervalId = window.setInterval(
      () => setPhase((p) => Math.min(p + 1, SCAN_PHASES.length - 1)),
      SCAN_PHASE_MS,
    )
    return () => window.clearInterval(intervalId)
  }, [isActive])

  // Linger past the end of the scan so the slide-out can play, then unmount
  // and rewind, so the next scan starts from the first stage word.
  useEffect(() => {
    if (isActive) return
    const timeoutId = window.setTimeout(() => {
      setIsMounted(false)
      setPhase(0)
    }, SCAN_EXIT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [isActive])

  if (!isMounted) return null
  return (
    <span
      className={scanVariants({ isLeaving: !isActive })}
      role={isLiveRegion ? 'status' : undefined}
      aria-hidden={isActive ? undefined : true}
    >
      <span className={cx(STATUS_DOT, 'animate-[status-pulse_1.6s_ease-in-out_infinite]')} aria-hidden />
      {/* The stage words are stacked so they cross-fade in place; a hidden sizer
          (the longest label) holds the box to a stable width so nothing reflows. */}
      <span className="relative inline-block">
        <span className="invisible" aria-hidden>
          Identifying
        </span>
        {SCAN_PHASES.map((label, i) => (
          <span
            key={label}
            className={scanPhaseVariants({ state: scanPhaseState(i, phase) })}
            aria-hidden={i !== phase}
          >
            {label}
          </span>
        ))}
      </span>
    </span>
  )
}

// The online tally shares the scan status's slot and motion: it slides in from
// the left when a scan finishes (active turns true) and slides back out to the
// left when the next scan starts and the status takes the slot. Like ScanStatus
// it lingers mounted for SCAN_EXIT_MS so the slide-out can play rather than the
// count just vanishing.
function OnlineIndicator({
  isActive,
  count,
}: {
  isActive: boolean
  count: number
}): JSX.Element | null {
  const [isMounted, setIsMounted] = useState(isActive)
  if (isActive && !isMounted) setIsMounted(true)

  useEffect(() => {
    if (isActive) return
    const timeoutId = window.setTimeout(() => setIsMounted(false), SCAN_EXIT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [isActive])

  if (!isMounted) return null
  return (
    <span
      className={onlineVariants({ isLeaving: !isActive })}
      title="Responding to the last scan"
      aria-hidden={isActive ? undefined : true}
    >
      <span className={STATUS_DOT} aria-hidden />
      <span className="num text-secondary">{count}</span> online
    </span>
  )
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
  name: string
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
        />
      </div>
    )
  }

  const metaParts = deviceMetaParts(device, name)
  if (metaParts.length === 0 && !lastSeenLabel) return null
  return (
    <div className={DEVICE_META}>
      {metaParts.length > 0 && <InlineMeta items={metaParts} className={DEVICE_KIND} />}
      {/* ml-auto keeps the age flush right even when the type label is absent. */}
      {lastSeenLabel && <span className="text-meta ml-auto shrink-0">{lastSeenLabel}</span>}
    </div>
  )
}

function DeviceRow({ device }: { device: LanDevice }): JSX.Element {
  const now = useNow(ROW_CLOCK_INTERVAL_MS)
  const name = deviceName(device)
  const lastSeenLabel = lastSeenAge(device, now)
  const shouldShowRandomizedTag = device.isRandomizedMac && !device.isGateway && !device.isSelf

  return (
    <li className={DEVICE_ROW}>
      <span className={iconVariants({ tone: device.isGateway ? 'positive' : KIND_TONES[device.kind] })}>
        <KindIcon kind={device.kind} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Name on the left, status on the right. mb-2 adds a touch more air
            below the (larger) name, on top of the column's 4px gap. */}
        <div className="mb-2 flex items-start justify-between gap-8">
          <h2 className={DEVICE_NAME}>{name}</h2>
          <span
            className={stateVariants({ isReachable: device.isReachable })}
            title={device.isReachable ? 'Reachable' : 'Offline — no response to recent scans'}
          >
            <span className="size-[5px] rounded-full bg-current" aria-hidden />
            {device.isReachable ? 'Online' : 'Offline'}
          </span>
        </div>

        <DeviceMetaLine device={device} name={name} lastSeenLabel={lastSeenLabel} />

        {/* MAC on the left, IP pinned to the bottom-right. */}
        <div className="flex items-baseline justify-between gap-8">
          <span className="text-meta inline-flex min-w-0 items-baseline gap-8 tabular-nums">
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
    </li>
  )
}

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
        <span className="field-label">Subnet</span>
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
        icon={DevicesIcon}
        title="No devices yet"
        hint={shouldShowLocalNetworkHint ? LOCAL_NETWORK_HINT : undefined}
        action={
          <Button onClick={onRescan}>
            Try again
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
        <p className="text-muted mt-10 max-w-[40ch] px-4 text-sm leading-small">{LOCAL_NETWORK_HINT}</p>
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
              isBusy={isScanning}
              onClick={onRescan}
              busyBehavior="ignore"
            />
          </>
        }
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
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
