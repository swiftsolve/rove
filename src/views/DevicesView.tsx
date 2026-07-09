import type { LanDevice, LanDeviceKind, LanDeviceScan } from '@/types'
import { LAN_DEVICE_KIND_LABELS } from '@/types'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import { Spinner } from '@/components/ui/Spinner'
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
  RefreshIcon,
  RouterIcon,
  SpeakerIcon,
  TabletIcon,
  TvIcon,
  UnknownDeviceIcon,
  WatchIcon,
} from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'

const SCAN_HINT =
  'Rove scans your subnet and reads mDNS, SSDP/UPnP, NetBIOS and HTTP replies to identify devices. A device that blocks every probe and announces nothing at all can still be missed.'

// Local Network access can't be queried on macOS, so when discovery comes up
// empty we surface the most likely cause rather than implying the LAN is bare.
import { IS_MAC } from '@/lib/platform'
const LOCAL_NETWORK_HINT =
  'Missing devices? Rove needs Local Network access. Enable it in System Settings › Privacy & Security › Local Network, then scan again.'
import './DevicesView.css'

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
// fall straight to "Unknown device", name it from whatever we did learn:
// "Android phone", "Android device", or just "Phone".
function describeUnnamed(device: LanDevice): string {
  const noun = device.kind !== 'unknown' ? KIND_NOUNS[device.kind] : null
  if (device.os && noun) return `${device.os} ${noun}`
  if (device.os) return `${device.os} device`
  if (noun) return noun.charAt(0).toUpperCase() + noun.slice(1)
  return 'Unknown device'
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
      <div className="view-header devices-header">
        <span className="view-header-icon">
          <DevicesIcon size={18} />
        </span>
        <div className="devices-header-text">
          <span className="view-header-title">
            {hasDevices
              ? `${devices.length} ${devices.length === 1 ? 'device' : 'devices'}`
              : 'Devices'}
          </span>
          {/* Always rendered so the title keeps its position; the subnet fades in
             once the scan resolves, and a scanning hint fills the slot until then. */}
          <span className={`devices-subnet${hasDevices && subnet ? ' show' : ''}`}>
            {hasDevices && subnet ? (
              <>
                <span className="field-label">Subnet</span>
                <span className="num">{subnet}</span>
              </>
            ) : (
              <span className="devices-subnet-status">{isScanning ? 'Scanning…' : ' '}</span>
            )}
          </span>
        </div>
        <div className="devices-header-actions">
          <Tooltip content={SCAN_HINT}>
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              aria-label="About device scanning"
            >
              <HelpIcon size={16} />
            </button>
          </Tooltip>
          <Tooltip content="Scan again">
            <button
              type="button"
              className={`btn-icon btn-icon-secondary${isScanning ? ' is-scanning' : ''}`}
              onClick={isScanning ? undefined : onRescan}
              aria-label="Scan again"
              aria-busy={isScanning}
            >
              {isScanning ? <ButtonSpinner size={14} /> : <RefreshIcon size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {isScanning && devices.length === 0 ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Scanning your network…</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="view-empty">
          <p className="text-muted">No devices found on your network.</p>
          {showLocalNetworkHint && <p className="text-muted devices-hint">{LOCAL_NETWORK_HINT}</p>}
          <button type="button" className="btn-secondary" onClick={onRescan}>
            Scan again
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
