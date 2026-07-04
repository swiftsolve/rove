import type { LanDevice, LanDeviceKind, LanDeviceScan } from '@shared/types'
import { LAN_DEVICE_KIND_LABELS } from '@shared/types'
import {
  ChipIcon,
  ComputerIcon,
  DeviceIcon,
  PrinterIcon,
  RefreshIcon,
  RouterIcon,
  TvIcon,
  UnknownDeviceIcon,
} from '../components/Icons'
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
  computer: ComputerIcon,
  phone: DeviceIcon,
  tv: TvIcon,
  printer: PrinterIcon,
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
      <div className="device-row-main">
        <span className={`device-row-icon kind-${device.kind}`}>
          <KindIcon kind={device.kind} />
        </span>
        <div className="device-row-text">
          <div className="device-row-title">
            <span className="text-title device-row-name">{deviceName(device)}</span>
            {device.isGateway && <span className="text-meta iface-tag">Gateway</span>}
            {!device.isGateway && device.kind !== 'unknown' && (
              <span className="text-meta iface-tag muted">
                {LAN_DEVICE_KIND_LABELS[device.kind]}
              </span>
            )}
          </div>
          <span className="text-meta device-row-mac">
            <span className="device-row-mac-addr">{device.mac.toUpperCase()}</span>
            {device.isRandomizedMac && !device.isGateway && !device.isSelf && (
              <span className="device-row-random" title="Privacy-randomized MAC address">
                Randomized
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="device-row-meta">
        <span className="device-row-ip num">{device.ip}</span>
        <span
          className={`device-row-state ${device.reachable ? 'reachable' : 'stale'}`}
          title={device.reachable ? 'Reachable' : 'Cached (may be offline)'}
        >
          <span className="device-row-dot" aria-hidden />
          {device.reachable ? 'Online' : 'Cached'}
        </span>
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
  const rescanning = isScanning && devices.length > 0

  return (
    <div className="view-page">
      <div className="devices-header">
        <span className="devices-header-icon">
          <DeviceIcon size={17} />
        </span>
        <div className="devices-header-text">
          <span className="devices-count">
            {devices.length > 0
              ? `${devices.length} ${devices.length === 1 ? 'device' : 'devices'}`
              : 'Devices'}
          </span>
          {devices.length > 0 && scan?.subnet && (
            <span className="devices-subnet">
              <span className="field-label">Subnet</span>
              <span className="num">{scan.subnet}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          onClick={onRescan}
          disabled={isScanning}
          title="Scan again"
          aria-label="Scan again"
        >
          {rescanning ? <span className="btn-spinner" /> : <RefreshIcon size={16} />}
        </button>
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
        <>
          <p className="devices-hint">
            Recently seen on this network — idle devices may not appear until they send traffic.
            Your router&apos;s admin page is the authoritative list.
          </p>
          <div className="device-list">
            {devices.map((device) => (
              <DeviceRow key={device.mac} device={device} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
