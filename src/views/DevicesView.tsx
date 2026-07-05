import type { LanDevice, LanDeviceKind, LanDeviceScan } from '@/types'
import { LAN_DEVICE_KIND_LABELS } from '@/types'
import {
  CameraIcon,
  ChipIcon,
  ComputerIcon,
  ConsoleIcon,
  DeviceIcon,
  HelpIcon,
  NasIcon,
  PrinterIcon,
  RefreshIcon,
  RouterIcon,
  SpeakerIcon,
  TabletIcon,
  TvIcon,
  UnknownDeviceIcon,
} from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'

const SCAN_HINT =
  "Beacon actively scans your subnet; a device that blocks pings and doesn't announce itself may still be missed. Your router's admin page is the authoritative list."
import './DevicesView.css'

interface DevicesViewProps {
  readonly scan: LanDeviceScan | null
  readonly isScanning: boolean
  readonly error: string | null
  readonly onRescan: () => void
}

function deviceName(device: LanDevice): string {
  if (device.isGateway) return 'Router'
  if (device.isSelf) return 'This device'
  return device.hostname ?? device.vendor ?? 'Unknown device'
}

const KIND_ICONS: Record<LanDeviceKind, (props: { size?: number }) => JSX.Element> = {
  router: RouterIcon,
  nas: NasIcon,
  computer: ComputerIcon,
  tablet: TabletIcon,
  phone: DeviceIcon,
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
  return (
    <section className={`ui-section device-row ${device.isGateway ? 'gateway' : ''}`}>
      <span className={`device-row-icon kind-${device.kind}`}>
        <KindIcon kind={device.kind} />
      </span>
      <div className="device-row-body">
        <div className="device-row-top">
          <span className="text-title device-row-name">{deviceName(device)}</span>
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
          device.kind !== 'unknown' && (
            <span className="text-meta device-row-kind">
              {LAN_DEVICE_KIND_LABELS[device.kind]}
            </span>
          )
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
  const rescanning = isScanning && devices.length > 0

  return (
    <div className="view-page">
      <div className="devices-header">
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
              className="btn-icon btn-icon-secondary"
              onClick={onRescan}
              disabled={isScanning}
              aria-label="Scan again"
            >
              {rescanning ? <span className="btn-spinner" /> : <RefreshIcon size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {isScanning && devices.length === 0 ? (
        <div className="view-empty">
          <div className="spinner" />
          <p className="text-muted">Scanning your network…</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="view-empty">
          <p className="text-muted">No devices found on your network.</p>
          <button type="button" className="btn-secondary" onClick={onRescan}>
            Scan again
          </button>
        </div>
      ) : (
        <div className="device-list">
          {devices.map((device) => (
            <DeviceRow key={`${device.mac}-${device.ip}`} device={device} />
          ))}
        </div>
      )}
    </div>
  )
}
