import { memo, useState } from 'react'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isConnectedNetwork, isEthernetNetwork, isWifiNetwork } from '@/types'
import { getConnectionDisplay } from '@/components/connection/connection-display'
import { networkInfoEqual } from '@/components/connection/network-info-equal'
import { usePublicIp } from '@/hooks/usePublicIp'
import {
  formatBand,
  formatChannel,
  formatDisplayValue,
  formatDuplex,
  formatSignalStrength,
  formatSpeedMbps,
  formatWifiSignal,
  formatWifiStandard,
} from '@/lib/format'
import DataRow from '@/components/ui/DataRow'
import { ChevronDownIcon, EthernetIcon, OfflineIcon, WifiIcon } from '@/components/ui/Icons'
import './ConnectionCard.css'

interface ConnectionCardProps {
  readonly info: NetworkInfo
}

function ConnectionIcon({ variant }: { readonly variant: string }): JSX.Element {
  if (variant === 'wifi') return <WifiIcon size={16} />
  if (variant === 'ethernet') return <EthernetIcon size={16} />
  return <OfflineIcon size={16} />
}

const SIGNAL_BARS = [0, 1, 2, 3]

function signalBarCount(strength: number): number {
  if (strength >= 80) return 4
  if (strength >= 55) return 3
  if (strength >= 35) return 2
  return 1
}

function signalLevelClass(strength: number): string {
  if (strength >= 55) return 'sig-good'
  if (strength >= 35) return 'sig-fair'
  return 'sig-weak'
}

function SignalMeter({ strength }: { readonly strength: number }): JSX.Element {
  const label = formatSignalStrength(strength)
  const filled = signalBarCount(strength)

  return (
    <div
      className={`signal-meter ${signalLevelClass(strength)}`}
      role="meter"
      aria-label={`Wi‑Fi signal: ${label}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="signal-bars" aria-hidden>
        {SIGNAL_BARS.map((i) => (
          <span key={i} className={`signal-bar${i < filled ? ' on' : ''}`} />
        ))}
      </span>
    </div>
  )
}

function WifiExtras({ info }: { readonly info: WifiNetworkInfo }): JSX.Element {
  return (
    <>
      <DataRow label="Signal">
        <span className="signal-detail">
          {info.signalStrength != null && <SignalMeter strength={info.signalStrength} />}
          {formatWifiSignal(info.signalStrength, info.signalDbm)}
        </span>
      </DataRow>
      <DataRow label="Band" value={formatBand(info.frequency)} />
      <DataRow label="Channel" value={formatChannel(info.channel, info.frequency)} />
      <DataRow label="Security" value={formatDisplayValue(info.security)} />
      <DataRow label="Standard" value={formatWifiStandard(info.wifiStandard)} />
    </>
  )
}

function EthernetExtras({ info }: { readonly info: EthernetNetworkInfo }): JSX.Element {
  return (
    <>
      <DataRow label="Adapter" value={formatDisplayValue(info.product)} />
      <DataRow label="Duplex" value={formatDisplayValue(formatDuplex(info.duplex))} />
      <DataRow label="Vendor" value={formatDisplayValue(info.vendor)} />
    </>
  )
}

const EXPANDED_KEY = 'beacon.connection-details-expanded'

function ConnectionCard({ info }: ConnectionCardProps): JSX.Element {
  // Persisted so the choice survives tab switches (which unmount this card)
  // and restarts. Defaults to collapsed rather than auto-expanding.
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleExpanded = (): void => {
    setExpanded((open) => {
      const next = !open
      try {
        localStorage.setItem(EXPANDED_KEY, String(next))
      } catch {
        // Storage unavailable — remember for this session only.
      }
      return next
    })
  }
  const display = getConnectionDisplay(info)
  const { publicIp, isLoading: publicIpLoading } = usePublicIp(
    isConnectedNetwork(info),
    info.ipAddress,
  )
  const linkSpeed =
    (isWifiNetwork(info) || isEthernetNetwork(info)) && info.linkSpeedMbps != null
      ? formatSpeedMbps(info.linkSpeedMbps)
      : null
  const subBits = isWifiNetwork(info)
    ? [info.ipAddress, formatBand(info.frequency)]
    : [info.ipAddress, linkSpeed]
  const subLine = subBits.filter(Boolean).join(' · ') || display.subtitle
  const detailsLabel = expanded ? 'Hide connection details' : 'Show connection details'

  return (
    <section className={`conn-card ${display.variant}`}>
      <button
        type="button"
        className="conn-strip"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-label={detailsLabel}
      >
        <div className="conn-strip-icon">
          <ConnectionIcon variant={display.variant} />
        </div>
        <div className="conn-strip-text">
          <div className="text-title conn-strip-title">{display.title}</div>
          <div className="text-secondary conn-strip-sub">{subLine}</div>
        </div>
        {isWifiNetwork(info) && info.signalStrength != null && (
          <SignalMeter strength={info.signalStrength} />
        )}
        <ChevronDownIcon
          size={14}
          className={`conn-chevron ${expanded ? 'open' : ''}`}
          aria-hidden
        />
      </button>

      <div className={`conn-details-wrap ${expanded ? 'open' : ''}`}>
        <div className="conn-details row-list">
          <DataRow label="IP address" value={formatDisplayValue(info.ipAddress)} />
          <DataRow
            label="Public IP"
            value={publicIp ?? (publicIpLoading ? 'Checking…' : null)}
          />
          <DataRow label="Gateway" value={formatDisplayValue(info.gateway)} />
          {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
          {isWifiNetwork(info) && <WifiExtras info={info} />}
          {isEthernetNetwork(info) && <EthernetExtras info={info} />}
          <DataRow label="Interface" value={formatDisplayValue(info.interfaceName)} />
          <DataRow label="MAC" value={formatDisplayValue(info.macAddress)} />
          {info.dns.length > 0 && (
            <DataRow label="DNS" value={formatDisplayValue(info.dns.join(', '))} />
          )}
        </div>
      </div>
    </section>
  )
}

export function canRunSpeedTest(info: NetworkInfo): boolean {
  return isConnectedNetwork(info)
}

export default memo(
  ConnectionCard,
  (previous, next) => networkInfoEqual(previous.info, next.info),
)
