import { useEffect, useState } from 'react'
import type { LanDevice, LanDeviceKind, LanDeviceScan } from '@/types'
import { LAN_DEVICE_KIND_LABELS } from '@/types'
import { RefreshIconButton } from '@/components/ui/RefreshIconButton'
import { Spinner } from '@/components/ui/Spinner'
import { ViewHeader } from '@/components/ui/ViewHeader'
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
} from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { IS_MAC } from '@/lib/platform'
import './DevicesView.css'

const SCAN_HINT =
  'Rove scans your subnet and reads mDNS, SSDP/UPnP, NetBIOS and HTTP replies to identify devices. A device that blocks every probe and announces nothing at all can still be missed.'

// Local Network access can't be queried on macOS, so when discovery comes up
// empty we surface the most likely cause rather than implying the LAN is bare.
const LOCAL_NETWORK_HINT =
  'Missing devices? Rove needs Local Network access. Enable it in System Settings › Privacy & Security › Local Network, then scan again.'

interface DevicesViewProps {
  readonly scan: LanDeviceScan | null
  readonly isScanning: boolean
  readonly error: string | null
  readonly onRescan: () => void
}

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

// A privacy-randomized phone often has no OUI vendor and no hostname, yet the
// scan still identifies its OS/kind (e.g. via the DHCP fingerprint). Rather than
// fall straight to "Generic device", name it from whatever we did learn:
// "Android phone", "Android device", or just "Phone".
function describeUnnamed(device: LanDevice): string {
  const noun = device.kind !== 'unknown' ? KIND_NOUNS[device.kind] : null
  if (device.os && noun) return `${device.os} ${noun}`
  if (device.os) return `${device.os} device`
  if (noun) return noun.charAt(0).toUpperCase() + noun.slice(1)
  return 'Generic device'
}

function deviceName(device: LanDevice): string {
  if (device.isGateway) return 'Router'
  if (device.isSelf) return 'This device'
  return device.hostname ?? device.vendor ?? describeUnnamed(device)
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

function KindIcon({ kind }: { readonly kind: LanDeviceKind }): JSX.Element {
  const Icon = KIND_ICONS[kind]
  return <Icon size={16} />
}

// The scan runs its stages concurrently and reports no per-stage progress, so
// this steps through them on a timer — a forward-reading approximation, in the
// pipeline's real order (sweep the subnet, listen for announcements, then name
// and classify what replied). It holds on the last stage until the scan ends.
const SCAN_PHASES = ['Sweeping', 'Listening', 'Identifying'] as const
const SCAN_PHASE_MS = 1300

// How long the exit slide plays before the indicator unmounts. Matches
// --duration-normal in index.css.
const SCAN_EXIT_MS = 220

// A pulsing green dot + one-word stage. On first load it fills the subtitle
// slot alone; on a rescan it trails the subnet.
//
// Motion: the indicator slides in from the left when a scan starts, the stage
// words fade upward through each other while it runs, and on completion the
// whole thing slides back out to the left. The exit is why it takes `active`
// instead of being conditionally rendered — it stays mounted for SCAN_EXIT_MS
// after the scan ends so the slide-out can play.
//
// All three words are stacked (a hidden sizer holds the width to the longest
// so the layout never jumps); the current one is driven by data-state.
function ScanStatus({ active }: { readonly active: boolean }): JSX.Element | null {
  const [phase, setPhase] = useState(0)
  const [mounted, setMounted] = useState(active)

  // Step the stage word while a scan runs; restart from the first each scan.
  useEffect(() => {
    if (!active) return
    setPhase(0)
    const id = window.setInterval(
      () => setPhase((p) => Math.min(p + 1, SCAN_PHASES.length - 1)),
      SCAN_PHASE_MS,
    )
    return () => window.clearInterval(id)
  }, [active])

  // Linger past the end of the scan so the slide-out can play, then unmount.
  useEffect(() => {
    if (active) {
      setMounted(true)
      return
    }
    const id = window.setTimeout(() => setMounted(false), SCAN_EXIT_MS)
    return () => window.clearTimeout(id)
  }, [active])

  if (!mounted) return null
  return (
    <span className={`devices-scan ${active ? '' : 'leaving'}`} role="status">
      <span className="devices-scan-dot" aria-hidden />
      <span className="devices-scan-phases">
        <span className="devices-scan-phase-sizer" aria-hidden>
          Identifying
        </span>
        {SCAN_PHASES.map((label, i) => (
          <span
            key={label}
            className="devices-scan-phase"
            data-state={i === phase ? 'current' : i < phase ? 'past' : 'next'}
            aria-hidden={i !== phase}
          >
            {label}
          </span>
        ))}
      </span>
    </span>
  )
}

function DeviceRow({ device }: { readonly device: LanDevice }): JSX.Element {
  const name = deviceName(device)
  // Kind · vendor · OS · model, dropping unknown parts. Vendor comes from the
  // MAC OUI (or an inferred maker like Apple); OS from the passive DHCP
  // fingerprint. Case-insensitively drop any part that just repeats the name
  // (e.g. a nameless host shown as its vendor) or an earlier part (an Apple
  // handheld whose vendor and OS are both "Apple").
  const seen = new Set<string>([name.toLowerCase()])
  const meta = [
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

  return (
    <section className={`ui-section device-row ${device.isGateway ? 'gateway' : ''}`}>
      <span className={`device-row-icon kind-${device.kind}`}>
        <KindIcon kind={device.kind} />
      </span>
      <div className="device-row-body">
        <div className="device-row-top">
          <span className="text-title device-row-name">{name}</span>
          <span
            className={`device-row-state ${device.reachable ? 'reachable' : 'stale'}`}
            title={device.reachable ? 'Reachable' : 'Cached (may be offline)'}
          >
            <span className="device-row-dot" aria-hidden />
            {device.reachable ? 'Online' : 'Cached'}
          </span>
        </div>

        {device.isGateway ? (
          <span className="text-meta device-row-kind gateway">Gateway</span>
        ) : (
          meta.length > 0 && <span className="text-meta device-row-kind">{meta.join(' · ')}</span>
        )}

        <div className="device-row-bottom">
          <span className="text-meta device-row-mac">
            <span className="device-row-mac-addr">{device.mac.toUpperCase()}</span>
            {device.isRandomizedMac && !device.isGateway && !device.isSelf && (
              <span className="device-row-random" title="Privacy-randomized MAC address">
                Randomized
              </span>
            )}
          </span>
          <span className="device-row-ip num">{device.ip}</span>
        </div>
      </div>
    </section>
  )
}

export default function DevicesView({
  scan,
  isScanning,
  error,
  onRescan,
}: DevicesViewProps): JSX.Element {
  const devices = scan?.devices ?? []
  const hasDevices = devices.length > 0
  const subnet = scan?.subnet ?? null
  // Scan resolved but turned up only this machine (or nothing) — on macOS the
  // usual culprit is a withheld Local Network grant.
  const onlySelf =
    !isScanning && scan != null && devices.every((device) => device.isSelf)
  const showLocalNetworkHint = IS_MAC && onlySelf

  return (
    <div className="view-page">
      <ViewHeader
        icon={<DevicesIcon size={18} />}
        title={
          hasDevices
            ? `${devices.length} ${devices.length === 1 ? 'device' : 'devices'}`
            : 'Devices'
        }
        // The subnet fades in once the scan resolves; a scanning hint fills the
        // slot (which reserves its height, so the title never shifts) until then.
        subtitle={
          hasDevices && subnet ? (
            <>
              <span className="field-label">Subnet</span>
              <span className="num">{subnet}</span>
              <ScanStatus active={isScanning} />
            </>
          ) : isScanning ? (
            <ScanStatus active />
          ) : undefined
        }
        subtitleClassName="devices-subnet"
        subtitleShown={hasDevices && subnet != null}
        actions={
          <>
            <Tooltip content={SCAN_HINT}>
              <button
                type="button"
                className="btn-icon btn-icon-secondary"
                aria-label="About device scanning"
              >
                <HelpIcon size={16} />
              </button>
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

      {error && <div className="error-banner">{error}</div>}

      {isScanning && devices.length === 0 ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Scanning your network…</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="view-empty devices-empty">
          <DevicesIcon size={40} className="devices-empty-icon" />
          <p className="devices-empty-title">No devices found</p>
          {showLocalNetworkHint && (
            <p className="text-muted devices-hint">{LOCAL_NETWORK_HINT}</p>
          )}
          <button type="button" className="btn-secondary" onClick={onRescan}>
            Try again
          </button>
        </div>
      ) : (
        <div className="device-list">
          {devices.map((device) => (
            <DeviceRow key={`${device.mac}-${device.ip}`} device={device} />
          ))}
          {showLocalNetworkHint && (
            <p className="text-muted devices-hint">{LOCAL_NETWORK_HINT}</p>
          )}
        </div>
      )}
    </div>
  )
}
